import type { GenerateContentResponse, GenerationConfig, GenerativeModel, Part } from '@google-cloud/vertexai';
import type {
    IMediaAnalysisModel,
    ILogger,
    MediaAnalysisRequest,
    MediaAnalysisResult,
    MediaKind,
    MediaToolCall,
    MessagePart,
} from '@lemonade/core';
import { AI_GENERATION_CONFIGS } from '@lemonade/core';
import type { GeminiCoreAdapter } from '../GeminiCoreAdapter';
import type { FunctionCallService } from '../FunctionCallHandler';
import { generationConfigForEffort } from './generationConfig';
import { ANALYSIS_RESPONSE_SCHEMA } from './responseSchemas';
import { toCountableParts } from './chatContent';

function mediaPart(request: MediaAnalysisRequest): Part {
    const { media } = request;
    if (media.data) return { inlineData: { mimeType: media.mimeType, data: media.data } };
    return { fileData: { mimeType: media.mimeType, fileUri: media.uri ?? '' } };
}

function toolCallsOf(response: GenerateContentResponse): MediaToolCall[] {
    const parts = response.candidates?.[0]?.content?.parts || [];
    return parts.flatMap((p) =>
        p.functionCall ? [{ name: p.functionCall.name, args: p.functionCall.args as Record<string, unknown> }] : [],
    );
}

/**
 * Vertex Gemini behind the media analysis port. Gemini reads images, video and
 * audio natively. With a tool context, server-side tools run through
 * FunctionCallService and any remaining calls are handed back to the caller.
 */
export class GeminiMediaModel implements IMediaAnalysisModel {
    private readonly model: GenerativeModel;

    constructor(
        coreAdapter: GeminiCoreAdapter,
        readonly modelId: string,
        private readonly functionCallService: FunctionCallService,
        private readonly logger: ILogger,
    ) {
        this.model = coreAdapter.getGenerativeModel(modelId, coreAdapter.commonTools, coreAdapter.commonSafetySettings);
    }

    supports(kind: MediaKind): boolean {
        return kind === 'image' || kind === 'video' || kind === 'audio';
    }

    async analyze(request: MediaAnalysisRequest): Promise<MediaAnalysisResult> {
        const genConfig = request.realtime
            ? AI_GENERATION_CONFIGS.LIVE_VIDEO
            : generationConfigForEffort(request.reasoningEffort);

        // thinkingConfig is accepted by the API but missing from the SDK's types.
        const generationConfig = {
            responseMimeType: request.structured ? 'application/json' : genConfig.responseMimeType,
            thinkingConfig: genConfig.thinkingConfig,
            temperature: genConfig.temperature,
            ...(request.structured ? { responseSchema: ANALYSIS_RESPONSE_SCHEMA } : {}),
        } as unknown as GenerationConfig;

        const parts: Part[] = [mediaPart(request), { text: request.prompt }];
        let response: GenerateContentResponse;

        if (request.tools) {
            const chat = this.model.startChat({ generationConfig });
            const first = await chat.sendMessage(parts);
            response = await this.functionCallService.handleFunctionCalls(first.response, chat, request.tools);
            return this.toResult(response, first.response);
        }

        const result = await this.model.generateContent({ contents: [{ role: 'user', parts }], generationConfig });
        response = result.response;
        return this.toResult(response, response);
    }

    async countTokens(content: string | MessagePart[]): Promise<number> {
        const parts = toCountableParts(content);
        if (parts.length === 0) return 0;

        try {
            const result = await this.model.countTokens({ contents: [{ role: 'user', parts }] });
            return result.totalTokens;
        } catch (error) {
            this.logger.error('countTokens failed', error as Error);
            return 0;
        }
    }

    /** Usage is billed from the first response; the reply and tool calls come from the final one. */
    private toResult(finalResponse: GenerateContentResponse, billedResponse: GenerateContentResponse) {
        const toolCalls = toolCallsOf(finalResponse);
        const parts = finalResponse.candidates?.[0]?.content?.parts || [];
        const text = toolCalls.length > 0 ? (parts.find((p) => p.text)?.text ?? null) : (parts[0]?.text ?? null);
        const usage = billedResponse.usageMetadata;

        return {
            text,
            toolCalls,
            usage: usage
                ? { inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 }
                : undefined,
            model: this.modelId,
        };
    }
}
