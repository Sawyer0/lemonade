import { injectable, inject } from 'inversify';
import { GenerativeModel, Tool, Part, SchemaType, GenerateContentResult } from '@google-cloud/vertexai';
import type {
    IChatAssistantAI,
    IMultimodalUploadAnalyzer,
    AIAnalysis,
    ILogger,
    IBillingService,
    IContextCacheService,
    ReasoningEffort,
    AiGenerationConfig,
    VerificationRequest,
    VerificationResponse,
    MessagePart,
    StreamingEvent,
} from '@lemonade/core';
import {
    AIAnalysisSchema,
    SystemPrompts,
    SafetyPrompts,
    VideoPrompts,
    AppError,
    ErrorCode,
    AI_GENERATION_CONFIGS,
    VerificationPrompts,
} from '@lemonade/core';
import { CONFIG } from '../config'; // Use local config
import { TracingService } from '../observability/TracingService'; // Use TracingService class
import { RequestContext } from '../context/request-context'; // Import RequestContext
import { TYPES } from '../di/types'; // Use local types
import { FunctionCallService } from './FunctionCallHandler';
import { GeminiCoreAdapter } from './GeminiCoreAdapter';

interface GroundingChunk {
    web?: {
        title?: string;
        uri?: string;
    };
}

@injectable()
export class GeminiFlashChatAndUploadsAdapter implements IChatAssistantAI, IMultimodalUploadAnalyzer {
    private model: GenerativeModel;
    private safetyTools: Tool[];
    private readonly CACHE_TTL_SECONDS = 3600; // 1 hour

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
        @inject(TYPES.FunctionCallService) private functionCallService: FunctionCallService,
        @inject(TYPES.ContextCacheService) private cacheService: IContextCacheService,
        @inject(TYPES.TracingService) private tracer: TracingService, // Inject TracingService
    ) {
        this.safetyTools = coreAdapter.commonTools;
        this.model = coreAdapter.getGenerativeModel(
            CONFIG.AI_MODELS.CHAT_MODEL,
            this.safetyTools,
            coreAdapter.commonSafetySettings,
        );
        this.logger.info(`GeminiFlashChatAndUploadsAdapter initialized, using model: ${CONFIG.AI_MODELS.CHAT_MODEL}`);
    }

    private getGenerationConfigForChat(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === 'low') return AI_GENERATION_CONFIGS.CHAT_BOT;
        if (effort === 'none')
            return {
                thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
                temperature: 0.1,
                responseMimeType: 'text/plain',
            };
        if (effort === 'moderate') return AI_GENERATION_CONFIGS.CHAT_MODERATE;
        if (effort === 'high') return AI_GENERATION_CONFIGS.CHAT_HIGH;
        return AI_GENERATION_CONFIGS.CHAT_BOT;
    }

    async verifyHypothesis(request: VerificationRequest, traceId?: string): Promise<VerificationResponse> {
        this.logger.debug('Verifying Hypothesis with Flash', { hypothesis: request.hypothesis, traceId });

        const cacheKey = `verifyHypothesis-${JSON.stringify(request)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for verifyHypothesis', { cacheKey, traceId });
            return existingCache as VerificationResponse;
        }

        const prompt = VerificationPrompts.factChecker(request.hypothesis, request.evidence);

        const apiRequest = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        isVerified: { type: SchemaType.BOOLEAN },
                        source: { type: SchemaType.STRING, nullable: true },
                        reasoning: { type: SchemaType.STRING },
                    },
                    required: ['isVerified', 'reasoning'],
                },
            } as unknown as import('@google-cloud/vertexai').GenerationConfig,
        };

        try {
            const result = await this.model.generateContent(apiRequest);
            const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) throw new Error('Empty verification response');

            const parsed = JSON.parse(text);
            const response: VerificationResponse = {
                isVerified: !!parsed.isVerified,
                source: parsed.source || null,
                reasoning: parsed.reasoning || 'No reasoning provided.',
            };
            await this.cacheService.createCache([{ text: JSON.stringify(response) }], this.CACHE_TTL_SECONDS, cacheKey);
            return response;
        } catch (error) {
            this.logger.error('Verification Logic Failed', error, { traceId });
            // Fail safe: Inconclusive
            return { isVerified: false, source: null, reasoning: 'Verification failed due to internal error.' };
        }
    }

    async analyzeUploadedVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number,
    ): Promise<AIAnalysis> {
        this.logger.debug('Sending to Vertex AI (Structured Output) for Uploaded Video Analysis', {
            videoUrl,
            mimeType,
            videoDurationMinutes,
        });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'User ID is required for uploaded video analysis billing.');
        }

        const cacheKeyData = { videoUrl, vehicleContext, mimeType, reasoningEffort, videoDurationMinutes };
        const cacheKey = `analyzeUploadedVideo-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for analyzeUploadedVideo', { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        const fullPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.analysis(vehicleContext)}
        `;

        const genConfig = this.getGenerationConfigForChat(reasoningEffort);

        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            fileData: {
                                mimeType: mimeType,
                                fileUri: videoUrl,
                            },
                        },
                        { text: fullPrompt },
                    ],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        safety_alert: { type: SchemaType.BOOLEAN },
                        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
                        diagnosis: { type: SchemaType.STRING },
                        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        engineDescription: { type: SchemaType.STRING },
                        isStock: { type: SchemaType.BOOLEAN },
                        visualConflictDetected: { type: SchemaType.BOOLEAN },
                        detectedCondition: {
                            type: SchemaType.STRING,
                            enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'],
                        },
                        confidence: { type: SchemaType.NUMBER },
                        verification: {
                            type: SchemaType.OBJECT,
                            properties: {
                                isVerified: { type: SchemaType.BOOLEAN },
                                verifiedSource: { type: SchemaType.STRING, nullable: true },
                                conflictingEvidence: { type: SchemaType.STRING, nullable: true },
                            },
                            required: ['isVerified'],
                        },
                    },
                    required: [
                        'safety_alert',
                        'severity',
                        'diagnosis',
                        'visual_evidence',
                        'acoustic_evidence',
                        'suggested_actions',
                        'engineDescription',
                        'isStock',
                        'visualConflictDetected',
                        'detectedCondition',
                        'confidence',
                    ],
                },
            } as unknown as import('@google-cloud/vertexai').GenerationConfig,
        };

        try {
            const result = await this.tracer.traceAiCall({
                name: 'uploaded_video_diagnostic_structured',
                inputs: { videoUrl, vehicleContext, mimeType },
                exec: async () => this.model.generateContent(request),
            });

            const vertexResult = result as unknown as GenerateContentResult;

            if (vertexResult.response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: vertexResult.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: vertexResult.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.CHAT_MODEL,
                    timestamp: new Date(),
                });
            }

            const responseText = vertexResult.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText)
                throw new AppError(
                    ErrorCode.AI_SERVICE_ERROR,
                    'AI returned empty response for uploaded video analysis',
                );

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));
            await this.cacheService.createCache([{ text: responseText }], this.CACHE_TTL_SECONDS, cacheKey);
            return analysis;
        } catch (error) {
            this.logger.error('Vertex AI Uploaded Video Analysis Failure', error);
            throw error;
        }
    }

    async analyzeUploadedImage(
        imageUrl: string,
        vehicleContext: string,
        mimeType: string = 'image/jpeg',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
    ): Promise<AIAnalysis> {
        this.logger.debug('Sending to Vertex AI (Structured Output) for Uploaded Image Analysis', {
            imageUrl,
            mimeType,
        });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'User ID is required for uploaded image analysis billing.');
        }

        const cacheKeyData = { imageUrl, vehicleContext, mimeType, reasoningEffort };
        const cacheKey = `analyzeUploadedImage-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for analyzeUploadedImage', { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        const fullPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.analysis(vehicleContext)}
        `;

        const genConfig = this.getGenerationConfigForChat(reasoningEffort);

        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            fileData: {
                                mimeType: mimeType,
                                fileUri: imageUrl,
                            },
                        },
                        { text: fullPrompt },
                    ],
                },
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        safety_alert: { type: SchemaType.BOOLEAN },
                        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
                        diagnosis: { type: SchemaType.STRING },
                        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        engineDescription: { type: SchemaType.STRING },
                        isStock: { type: SchemaType.BOOLEAN },
                        visualConflictDetected: { type: SchemaType.BOOLEAN },
                        detectedCondition: {
                            type: SchemaType.STRING,
                            enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'],
                        },
                        confidence: { type: SchemaType.NUMBER },
                        verification: {
                            type: SchemaType.OBJECT,
                            properties: {
                                isVerified: { type: SchemaType.BOOLEAN },
                                verifiedSource: { type: SchemaType.STRING, nullable: true },
                                conflictingEvidence: { type: SchemaType.STRING, nullable: true },
                            },
                            required: ['isVerified'],
                        },
                    },
                    required: [
                        'safety_alert',
                        'severity',
                        'diagnosis',
                        'visual_evidence',
                        'acoustic_evidence',
                        'suggested_actions',
                        'engineDescription',
                        'isStock',
                        'visualConflictDetected',
                        'detectedCondition',
                        'confidence',
                    ],
                },
            } as unknown as import('@google-cloud/vertexai').GenerationConfig,
        };

        try {
            const result = await this.tracer.traceAiCall({
                name: 'uploaded_image_diagnostic_structured',
                inputs: { imageUrl, vehicleContext, mimeType },
                exec: async () => this.model.generateContent(request),
            });

            const vertexResult = result as unknown as GenerateContentResult;

            if (vertexResult.response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: vertexResult.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: vertexResult.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.CHAT_MODEL,
                    timestamp: new Date(),
                });
            }

            const responseText = vertexResult.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText)
                throw new AppError(
                    ErrorCode.AI_SERVICE_ERROR,
                    'AI returned empty response for uploaded image analysis',
                );

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));
            await this.cacheService.createCache([{ text: responseText }], this.CACHE_TTL_SECONDS, cacheKey);
            return analysis;
        } catch (error) {
            this.logger.error('Vertex AI Uploaded Image Analysis Failure', error);
            throw error;
        }
    }

    async *generateReplyStream(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        vin?: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: Part[],
        traceId?: string,
    ): AsyncGenerator<StreamingEvent, void, unknown> {
        const genConfig = this.getGenerationConfigForChat(reasoningEffort);

        const chat = this.model.startChat({
            history: history.map((msg) => {
                let parts: Part[] = [];
                if (typeof msg.content === 'string') {
                    parts.push({ text: msg.content });
                } else if (Array.isArray(msg.content)) {
                    parts = (msg.content as MessagePart[]).map((part) => {
                        if (part.type === 'text' && part.text) return { text: part.text };
                        if (part.type === 'image' && part.image)
                            return { fileData: { mimeType: 'image/jpeg', fileUri: part.image } };
                        return { text: '' };
                    });
                }
                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: parts,
                };
            }),
            generationConfig: {
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseMimeType: genConfig.responseMimeType,
            } as unknown as import('@google-cloud/vertexai').GenerationConfig,
        });

        const contextPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        
        ${SafetyPrompts.masterTechInstruction()}
        `;

        const userParts: Part[] = [{ text: `${contextPrompt}\n\nUSER MESSAGE:\n${message}` }];
        if (additionalParts && additionalParts.length > 0) {
            userParts.push(...additionalParts);
        }

        const currentInput: Part[] = userParts;
        let loopCount = 0;
        const MAX_LOOPS = 3;
        let accumulatedText = '';

        while (loopCount < MAX_LOOPS) {
            const result = await chat.sendMessageStream(currentInput);

            for await (const chunk of result.stream) {
                // 1. Handle Thoughts (Reasoning Trace)
                const parts = chunk.candidates?.[0]?.content?.parts || [];
                const thoughtPart = parts.find((p) => 'thought' in p) as { thought?: string } | undefined;
                if (thoughtPart && thoughtPart.thought) {
                    yield { type: 'thought', content: thoughtPart.thought };
                }

                // 2. Handle Text Chunks
                const partText = parts.find((p) => p.text)?.text || '';
                if (partText) {
                    accumulatedText += partText;
                    yield { type: 'text', content: partText };
                }
            }

            const finalResponse = await result.response;

            // Handle Billing
            if (finalResponse.usageMetadata) {
                await this.billingService.recordUsage(
                    {
                        userId,
                        sessionId,
                        inputTokens: finalResponse.usageMetadata.promptTokenCount || 0,
                        outputTokens: finalResponse.usageMetadata.candidatesTokenCount || 0,
                        model: CONFIG.AI_MODELS.CHAT_MODEL,
                        timestamp: new Date(),
                    },
                    traceId,
                );
            }

            // 3. Handle Tool Calls
            const finalParts = finalResponse.candidates?.[0]?.content?.parts || [];
            const toolCalls = finalParts.filter((p) => p.functionCall);

            for (const call of toolCalls) {
                if (call.functionCall) {
                    yield {
                        type: 'tool_call',
                        toolName: call.functionCall.name,
                        toolCallId: 'call_' + Math.random().toString(36).substr(2, 9),
                        args: call.functionCall.args,
                    };
                }
            }

            // Orchestrate Tools
            const nextResponse = await this.functionCallService.handleFunctionCalls(finalResponse, chat, {
                userId,
                sessionId,
                vin,
            });

            if (nextResponse !== finalResponse) {
                // Tools were run!
                const nextParts = nextResponse.candidates?.[0]?.content?.parts || [];
                const nextText = nextParts.find((p) => p.text)?.text || '';
                const newText = nextText.replace(accumulatedText, '');
                if (newText) {
                    accumulatedText += newText;
                    yield { type: 'text', content: newText };
                }
                // Break after handling tool results for now to avoid infinite loops if not careful
                break;
            } else {
                break;
            }
            loopCount++;
        }

        yield { type: 'done' };
    }

    async generateReply(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        vin?: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: Part[],
        traceId?: string,
    ): Promise<string | MessagePart[]> {
        const genConfig = this.getGenerationConfigForChat(reasoningEffort);

        const cacheKeyData = {
            history,
            message,
            vehicleContext,
            diagnosticContext,
            genConfig,
            userId,
            sessionId,
            vin,
            reasoningEffort,
            additionalParts,
        };
        const cacheKey = `generateReply-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for generateReply', { cacheKey, traceId });
            return existingCache as string | MessagePart[];
        }

        const chat = this.model.startChat({
            history: history.map((msg) => {
                let parts: Part[] = [];
                if (typeof msg.content === 'string') {
                    parts.push({ text: msg.content });
                } else if (Array.isArray(msg.content)) {
                    parts = (msg.content as MessagePart[]).map((part) => {
                        if (part.type === 'text' && part.text) return { text: part.text };
                        if (part.type === 'image' && part.image)
                            return { fileData: { mimeType: 'image/jpeg', fileUri: part.image } };
                        return { text: '' };
                    });
                } else if (msg.content !== null && msg.content !== undefined) {
                    parts.push({ text: JSON.stringify(msg.content) });
                }
                return {
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: parts,
                };
            }),
            generationConfig: {
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseMimeType: genConfig.responseMimeType,
            } as unknown as import('@google-cloud/vertexai').GenerationConfig,
        });

        const contextPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        CONTEXT:
        Vehicle: ${vehicleContext}
        Current Diagnosis: ${diagnosticContext ? JSON.stringify(diagnosticContext) : 'None'}
        
        ${SafetyPrompts.masterTechInstruction()}
        `;

        const userParts: Part[] = [{ text: `${contextPrompt}\n\nUSER MESSAGE:\n${message}` }];
        if (additionalParts && additionalParts.length > 0) {
            userParts.push(...additionalParts);
        }

        const result = await this.tracer.traceAiCall<GenerateContentResult>({
            name: 'chat_reply',
            inputs: {
                vehicleContext,
                hasDiagnosticContext: !!diagnosticContext,
                hasAdditionalParts: !!(additionalParts && additionalParts.length > 0),
            },
            exec: () => {
                // Set traceId in RequestContext for the execution
                if (traceId) {
                    return RequestContext.run({ traceId }, () => chat.sendMessage(userParts));
                }
                return chat.sendMessage(userParts);
            },
        });

        if (result.response.usageMetadata) {
            await this.billingService.recordUsage(
                {
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.CHAT_MODEL, // Use CHAT_MODEL
                    timestamp: new Date(),
                },
                traceId,
            );
        }

        let response = result.response;
        response = await this.functionCallService.handleFunctionCalls(response, chat, {
            userId,
            sessionId,
            vin,
        });

        const finalCandidate = response.candidates?.[0];
        const contentParts = finalCandidate?.content?.parts || [];

        const messageParts: MessagePart[] = [];

        let text = contentParts.find((p: Part) => p.text)?.text;

        if (!text && contentParts.length) {
            const textPart = contentParts.find((p: Part) => p.text);
            if (textPart) text = textPart.text;
        }
        text = text || 'I processed that request.';

        const groundingMetadata = finalCandidate?.groundingMetadata;

        if (groundingMetadata && groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
            const sources: string[] = [];
            (groundingMetadata.groundingChunks as GroundingChunk[]).forEach((chunk, index: number) => {
                if (chunk.web) {
                    sources.push(`[${index + 1}] [${chunk.web.title}](${chunk.web.uri})`);
                }
            });
            if (sources.length > 0) {
                text += `\n\n**Sources:**\n${sources.join('\n')}`;
            }
        }

        messageParts.push({ type: 'text', text });

        const functionCalls = contentParts.filter((p: Part) => p.functionCall).map((p: Part) => p.functionCall);

        for (const call of functionCalls) {
            if (call) {
                this.logger.info(`Passing tool call to client: ${call.name}`, { traceId });
                messageParts.push({
                    type: 'tool-call',
                    toolName: call.name,
                    toolCallId: 'call_' + Math.random().toString(36).substr(2, 9),
                    args: call.args,
                });
            }
        }

        const finalResponse =
            messageParts.length > 1 || (messageParts.length === 1 && messageParts[0].type !== 'text')
                ? messageParts
                : text;

        await this.cacheService.createCache(
            [{ text: JSON.stringify(finalResponse) }],
            this.CACHE_TTL_SECONDS,
            cacheKey,
        ); // Cache the final response
        return finalResponse;
    }

    async countTokens(content: string | MessagePart[] | Part[]): Promise<number> {
        let parts: Part[] = [];

        if (typeof content === 'string') {
            parts = [{ text: content }];
        } else if (Array.isArray(content)) {
            if (
                content.length > 0 &&
                ('type' in content[0] || 'text' in content[0] || 'inlineData' in content[0] || 'fileData' in content[0])
            ) {
                parts = (content as MessagePart[])
                    .map((part) => {
                        if (part.type === 'text' && part.text) return { text: part.text };
                        if (part.type === 'image' && part.image) {
                            if (part.image.startsWith('http') || part.image.startsWith('gs://')) {
                                return { fileData: { mimeType: 'image/jpeg', fileUri: part.image } };
                            } else if (part.image.startsWith('data:')) {
                                const matches = part.image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
                                if (matches && matches.length === 3) {
                                    return { inlineData: { mimeType: matches[1], data: matches[2] } };
                                }
                            }
                        }
                        return { text: '' };
                    })
                    .filter((p) => ('text' in p && p.text !== '') || 'fileData' in p || 'inlineData' in p);
            } else {
                parts = content as Part[];
            }
        }

        if (parts.length === 0) return 0;

        try {
            const result = await this.model.countTokens({
                contents: [
                    {
                        role: 'user',
                        parts: parts,
                    },
                ],
            });
            return result.totalTokens;
        } catch (error) {
            this.logger.error('countTokens failed', error);
            return 0;
        }
    }
}
