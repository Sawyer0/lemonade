import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel, Tool, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { IChatAssistantAI } from '@/core/interfaces/IAIService';
import { AIAnalysis } from '@/core/entities/DiagnosticSession';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { VERIFY_SAFE_SUPPORT_TOOL } from '@/core/tools/verifySafeSupport';
import { SAFETY_INSTRUCTION_MASTER_TECH } from '@/core/prompts/safety';
import { OPEN_CAMERA_TOOL } from '@/core/tools/openCamera';
import { DISPLAY_CONTENT_TOOL } from '@/core/tools/displayContent';
import { CONFIG } from '@/infrastructure/config';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import type { ILogger } from '@/core/interfaces/ILogger';
import type { IBillingService } from '@/core/interfaces/IBillingService';
import { TYPES } from '@/infrastructure/di/types';
import { handleFunctionCalls } from './FunctionCallHandler';
import { processVoiceCommand } from './VoiceCommandProcessor';
import { ReasoningEffort, AI_GENERATION_CONFIGS, AiGenerationConfig } from '@/core/types/ai';

@injectable()
export class GeminiFlashAdapter implements IChatAssistantAI {
    private model: GenerativeModel;
    private safetyTools: Tool[];

    constructor(
        projectId: string,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService
    ) {
        // ... (constructor implementation remains unchanged) ...
        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!key) {
            this.logger.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is missing in GeminiFlashAdapter');
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'FIREBASE_SERVICE_ACCOUNT_KEY is missing');
        }
        this.logger.debug('GeminiFlashAdapter Key present', { keyLength: key.length });

        try {
            const credentials = JSON.parse(key);
            this.logger.debug('Service Account Email', { email: credentials.client_email });

            const authOptions = { credentials };

            const vertex = new VertexAI({
                project: projectId,
                location: 'us-central1',
                googleAuthOptions: authOptions
            });

            this.safetyTools = [{
                functionDeclarations: [VERIFY_SAFE_SUPPORT_TOOL, OPEN_CAMERA_TOOL, DISPLAY_CONTENT_TOOL]
            }];

            this.model = vertex.getGenerativeModel({
                model: CONFIG.AI_MODELS.TEXT_INTERFACE,
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
                ],
                tools: [
                    ...this.safetyTools,
                    { googleSearchRetrieval: {} }
                ]
            });
        } catch (error) {
            this.logger.error('Failed to initialize GeminiFlashAdapter', error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to initialize AI Adapter');
        }
    }

    private getGenerationConfigForChat(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === "low") return AI_GENERATION_CONFIGS.CHAT_BOT;
        if (effort === "none") return { thinkingConfig: { thinkingBudget: 0, includeThoughts: false }, temperature: 0.1, responseMimeType: "text/plain" };
        if (effort === "moderate") return AI_GENERATION_CONFIGS.CHAT_MODERATE;
        if (effort === "high") return AI_GENERATION_CONFIGS.CHAT_HIGH;
        return AI_GENERATION_CONFIGS.CHAT_BOT;
    }

    // ... (generateReply method implementation remains unchanged) ...
    async generateReply(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort
    ): Promise<string | import('@/core/types/models').MessagePart[]> {
        const genConfig = this.getGenerationConfigForChat(reasoningEffort);

        const chat = this.model.startChat({
            history: history.map(msg => {
                let text = '';
                try {
                    if (typeof msg.content === 'string') {
                        text = msg.content;
                    } else if (Array.isArray(msg.content)) {
                        text = msg.content
                            .filter((p: unknown) => p && typeof p === 'object' && 'type' in p && (p as { type: string }).type === 'text' && 'text' in p && typeof (p as { text: string }).text === 'string')
                            .map((p: unknown) => (p as { text: string }).text)
                            .join('\n');
                        if (!text) {
                            text = JSON.stringify(msg.content);
                        }
                    } else if (msg.content !== null && msg.content !== undefined) {
                        text = JSON.stringify(msg.content);
                    } else {
                        text = '';
                    }
                } catch (error) {
                    this.logger.error('Failed to serialize message content', error);
                    text = '[Content could not be displayed]';
                }
                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text }]
                };
            }),
            generationConfig: {
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseMimeType: genConfig.responseMimeType,
            } as any,
        });

        const contextPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        
        ${SAFETY_INSTRUCTION_MASTER_TECH}
        `;

        const fullPrompt = `
        ${contextPrompt}

        USER MESSAGE:
        ${message}
        `;

        const result = await traceAiCall({
            name: 'chat_reply',
            inputs: {
                vehicleContext,
                hasDiagnosticContext: !!diagnosticContext,
            },
            exec: () => chat.sendMessage(fullPrompt),
        });

        if (result.response.usageMetadata) {
            await this.billingService.recordUsage({
                userId: userId,
                sessionId: sessionId,
                inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                model: CONFIG.AI_MODELS.TEXT_INTERFACE,
                timestamp: new Date()
            });
        }

        let response = result.response;
        response = await handleFunctionCalls(response, chat, this.logger);

        const finalCandidate = response.candidates?.[0];
        const contentParts = finalCandidate?.content?.parts || [];

        const messageParts: import('@/core/types/models').MessagePart[] = [];

        let text = contentParts.find(p => p.text)?.text;

        if (!text && contentParts.length) {
            const textPart = contentParts.find(p => p.text);
            if (textPart) text = textPart.text;
        }
        text = text || "I processed that request.";

        const groundingMetadata = finalCandidate?.groundingMetadata;

        if (groundingMetadata && groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
            const sources: string[] = [];
            groundingMetadata.groundingChunks.forEach((chunk, index) => {
                if (chunk.web) {
                    sources.push(`[${index + 1}] [${chunk.web.title}](${chunk.web.uri})`);
                }
            });
            if (sources.length > 0) {
                text += `\n\n**Sources:**\n${sources.join('\n')}`;
            }
        }

        messageParts.push({ type: 'text', text });

        const functionCalls = contentParts.filter(p => p.functionCall).map(p => p.functionCall);

        for (const call of functionCalls) {
            if (call && call.name === 'openCamera') {
                this.logger.info("Passing openCamera tool call to client");
                messageParts.push({
                    type: 'tool-call',
                    toolName: call.name,
                    toolCallId: 'call_' + Math.random().toString(36).substr(2, 9),
                    args: call.args
                });
            }
        }

        if (messageParts.length > 1 || (messageParts.length === 1 && messageParts[0].type !== 'text')) {
            return messageParts;
        }

        return text;
    }

    async processVoiceCommand(
        audioData: Buffer,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort
    ): Promise<string> {
        return processVoiceCommand(this.model, audioData, mimeType, vehicleContext, this.logger, userId, sessionId, this.billingService, reasoningEffort);
    }
}