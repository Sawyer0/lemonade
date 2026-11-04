import type {
    ChatSession,
    GenerateContentResult,
    GenerationConfig,
    GenerativeModel,
    Part,
} from '@google-cloud/vertexai';
import type {
    AIAnalysis,
    IBillingService,
    IContextCacheService,
    ILogger,
    MessagePart,
    ReasoningEffort,
    StreamingEvent,
} from '@lemonade/core';
import { RequestContext } from '../../context/request-context';
import type { FunctionCallService } from '../FunctionCallHandler';
import type { TracingService } from '../../observability/TracingService';
import { generationConfigForEffort } from './generationConfig';
import { type ChatHistoryMessage, buildUserParts, formatGroundingSources, toVertexHistory } from './chatContent';
import { recordChatModelUsage } from './usageRecorder';
import { newToolCallId } from '../toolCallId';

const CACHE_TTL_SECONDS = 3600;

export interface ChatTurn {
    history: ChatHistoryMessage[];
    message: string;
    vehicleContext: string;
    diagnosticContext: AIAnalysis | null;
    userId: string;
    sessionId: string;
    vin?: string;
    reasoningEffort?: ReasoningEffort;
    additionalParts?: Part[];
    traceId?: string;
}

/**
 * The master-tech chat: one-shot replies (cached, with grounding sources and
 * client tool calls) and streamed replies (thoughts, text and tool calls as
 * they arrive). Server-side tools run through FunctionCallService.
 */
export class GeminiChatResponder {
    constructor(
        private readonly model: GenerativeModel,
        private readonly billingService: IBillingService,
        private readonly functionCallService: FunctionCallService,
        private readonly cacheService: IContextCacheService,
        private readonly tracer: TracingService,
        private readonly logger: ILogger,
    ) {}

    private startChat(turn: ChatTurn, stringifyObjects: boolean): ChatSession {
        const genConfig = generationConfigForEffort(turn.reasoningEffort);
        return this.model.startChat({
            history: toVertexHistory(turn.history, stringifyObjects),
            // thinkingConfig is accepted by the API but missing from the SDK's types.
            generationConfig: {
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseMimeType: genConfig.responseMimeType,
            } as unknown as GenerationConfig,
        });
    }

    async *stream(turn: ChatTurn): AsyncGenerator<StreamingEvent, void, unknown> {
        const { userId, sessionId, vin, traceId } = turn;
        const chat = this.startChat(turn, false);
        const userParts = buildUserParts(
            turn.message,
            turn.vehicleContext,
            turn.diagnosticContext,
            turn.additionalParts,
        );

        let accumulatedText = '';
        const result = await chat.sendMessageStream(userParts);

        for await (const chunk of result.stream) {
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            const thoughtPart = parts.find((p) => 'thought' in p) as { thought?: string } | undefined;
            if (thoughtPart && thoughtPart.thought) {
                yield { type: 'thought', content: thoughtPart.thought };
            }

            const partText = parts.find((p) => p.text)?.text || '';
            if (partText) {
                accumulatedText += partText;
                yield { type: 'text', content: partText };
            }
        }

        const finalResponse = await result.response;

        if (finalResponse.usageMetadata) {
            await recordChatModelUsage(this.billingService, finalResponse.usageMetadata, userId, sessionId, traceId);
        }

        const finalParts = finalResponse.candidates?.[0]?.content?.parts || [];
        for (const call of finalParts.filter((p) => p.functionCall)) {
            if (call.functionCall) {
                yield {
                    type: 'tool_call',
                    toolName: call.functionCall.name,
                    toolCallId: newToolCallId(),
                    args: call.functionCall.args,
                };
            }
        }

        // Run server-side tools; if they produced a follow-up answer, stream only its new text.
        const nextResponse = await this.functionCallService.handleFunctionCalls(finalResponse, chat, {
            userId,
            sessionId,
            vin,
        });
        if (nextResponse !== finalResponse) {
            const nextParts = nextResponse.candidates?.[0]?.content?.parts || [];
            const nextText = nextParts.find((p) => p.text)?.text || '';
            const newText = nextText.replace(accumulatedText, '');
            if (newText) {
                yield { type: 'text', content: newText };
            }
        }

        yield { type: 'done' };
    }

    async reply(turn: ChatTurn): Promise<string | MessagePart[]> {
        const { history, message, vehicleContext, diagnosticContext, userId, sessionId, vin, traceId } = turn;
        const genConfig = generationConfigForEffort(turn.reasoningEffort);

        const cacheKey = `generateReply-${JSON.stringify({
            history,
            message,
            vehicleContext,
            diagnosticContext,
            genConfig,
            userId,
            sessionId,
            vin,
            reasoningEffort: turn.reasoningEffort,
            additionalParts: turn.additionalParts,
        })}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for generateReply', { cacheKey, traceId });
            return existingCache as string | MessagePart[];
        }

        const chat = this.startChat(turn, true);
        const userParts = buildUserParts(message, vehicleContext, diagnosticContext, turn.additionalParts);

        const result = await this.tracer.traceAiCall<GenerateContentResult>({
            name: 'chat_reply',
            inputs: {
                vehicleContext,
                hasDiagnosticContext: !!diagnosticContext,
                hasAdditionalParts: !!(turn.additionalParts && turn.additionalParts.length > 0),
            },
            exec: () =>
                traceId
                    ? RequestContext.run({ traceId }, () => chat.sendMessage(userParts))
                    : chat.sendMessage(userParts),
        });

        if (result.response.usageMetadata) {
            await recordChatModelUsage(this.billingService, result.response.usageMetadata, userId, sessionId, traceId);
        }

        const response = await this.functionCallService.handleFunctionCalls(result.response, chat, {
            userId,
            sessionId,
            vin,
        });

        const finalCandidate = response.candidates?.[0];
        const contentParts = finalCandidate?.content?.parts || [];

        const text =
            (contentParts.find((p: Part) => p.text)?.text || 'I processed that request.') +
            formatGroundingSources(finalCandidate);

        const messageParts: MessagePart[] = [{ type: 'text', text }];

        for (const call of contentParts.map((p: Part) => p.functionCall)) {
            if (call) {
                this.logger.info(`Passing tool call to client: ${call.name}`, { traceId });
                messageParts.push({
                    type: 'tool-call',
                    toolName: call.name,
                    toolCallId: newToolCallId(),
                    args: call.args,
                });
            }
        }

        const finalResponse = messageParts.length > 1 ? messageParts : text;

        await this.cacheService.createCache([{ text: JSON.stringify(finalResponse) }], CACHE_TTL_SECONDS, cacheKey);
        return finalResponse;
    }
}
