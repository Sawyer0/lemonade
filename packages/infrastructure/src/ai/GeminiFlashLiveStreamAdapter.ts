import { injectable, inject } from 'inversify';
import { GenerativeModel, SchemaType, Part } from '@google-cloud/vertexai';
import type { ISessionRepository, IContextCacheService, IUserRepository, ILogger, IBillingService, IGoogleSearchService } from '@lemonade/core';
import {
    ILiveStreamAnalyzer,
    AIAnalysis,
    AIAnalysisSchema,
    VIDEO_PROMPTS,
    SYSTEM_PROMPTS,
    AppError,
    ErrorCode,
    ReasoningEffort,
    AI_GENERATION_CONFIGS,
    AiGenerationConfig,
    MessagePart,
    SHARED_CONFIG
} from '@lemonade/core';
import { TracingService } from '../observability/TracingService';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from './GeminiCoreAdapter';
import { FunctionCallService } from './FunctionCallHandler';

@injectable()
export class GeminiFlashLiveStreamAdapter implements ILiveStreamAnalyzer {
    private model: GenerativeModel;
    private readonly CACHE_TTL_SECONDS = 3600 * 24;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService, // Depends on the Service interface
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
        @inject(TYPES.FunctionCallService) private functionCallService: FunctionCallService,
        @inject(TYPES.ContextCacheService) private cacheService: IContextCacheService,
        @inject(TYPES.UserRepo) private userRepo: IUserRepository,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.TracingService) private tracer: TracingService
    ) {
        this.model = coreAdapter.getGenerativeModel(SHARED_CONFIG.AI_MODELS.LIVE_MODEL, coreAdapter.commonTools, coreAdapter.commonSafetySettings);
        this.logger.info(`GeminiFlashLiveStreamAdapter initialized, using model: ${SHARED_CONFIG.AI_MODELS.LIVE_MODEL}`);
    }

    async countTokens(content: string | MessagePart[] | Part[]): Promise<number> {
        let parts: Part[] = [];

        if (typeof content === 'string') {
            parts = [{ text: content }];
        } else if (Array.isArray(content)) {
            if (content.length > 0 && ('type' in content[0] || 'text' in content[0] || 'inlineData' in content[0] || 'fileData' in content[0])) {
                parts = (content as MessagePart[]).map(part => {
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
                    if (part.type === 'audio' && part.data) {
                        return { text: `[Audio Content: ${part.data}]` };
                    }
                    return { text: '' };
                }).filter(p => ('text' in p && p.text !== '') || ('fileData' in p) || ('inlineData' in p));
            } else {
                parts = content as Part[];
            }
        }

        if (parts.length === 0) return 0;

        try {
            const result = await this.model.countTokens({
                contents: [{
                    role: 'user',
                    parts: parts
                }]
            });
            return result.totalTokens;
        } catch (error) {
            this.logger.error("countTokens failed", error as Error);
            return 0;
        }
    }

    private getGenerationConfigForVideo(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === "none") return AI_GENERATION_CONFIGS.LIVE_VIDEO;
        return AI_GENERATION_CONFIGS.LIVE_VIDEO;
    }

    async analyzeFullVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number
    ): Promise<AIAnalysis> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Full Video Analysis", { videoUrl, mimeType, videoDurationMinutes });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User ID is required for video analysis access control.");
        }
        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User not found for video analysis access control.");
        }

        if (user.tier === 'free') {
            throw new AppError(ErrorCode.FORBIDDEN, "Free users do not have access to video analysis.");
        }

        const MAX_PRO_VIDEO_MINUTES = 35;
        if (user.tier === 'pro' && videoDurationMinutes !== undefined && videoDurationMinutes > MAX_PRO_VIDEO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Video exceeds maximum duration of ${MAX_PRO_VIDEO_MINUTES} minutes for Pro users.`);
        }

        const cacheKeyData = { videoUrl, vehicleContext, mimeType, reasoningEffort, videoDurationMinutes };
        const cacheKey = `analyzeVideo-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for analyzeMechanicalVideo', { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}
        `;

        const genConfig = this.getGenerationConfigForVideo(reasoningEffort);
        const model = this.model;

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        fileData: {
                            mimeType: mimeType,
                            fileUri: videoUrl
                        }
                    },
                    { text: fullPrompt }
                ]
            }],
            generationConfig: {
                responseMimeType: genConfig.responseMimeType,
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
                        detectedCondition: { type: SchemaType.STRING, enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'] },
                        confidence: { type: SchemaType.NUMBER },
                        verification: {
                            type: SchemaType.OBJECT,
                            properties: {
                                isVerified: { type: SchemaType.BOOLEAN },
                                verifiedSource: { type: SchemaType.STRING, nullable: true },
                                conflictingEvidence: { type: SchemaType.STRING, nullable: true }
                            },
                            required: ['isVerified']
                        }
                    },
                    required: ['safety_alert', 'severity', 'diagnosis', 'visual_evidence', 'acoustic_evidence', 'suggested_actions', 'engineDescription', 'isStock', 'visualConflictDetected', 'detectedCondition', 'confidence']
                }
            } as unknown as import('@google-cloud/vertexai').GenerationConfig
        };

        try {
            const result = await this.tracer.traceAiCall({
                name: 'video_diagnostic_structured',
                inputs: { videoUrl, vehicleContext, mimeType },
                exec: async () => model.generateContent(request) as any
            });

            if ((result as any).response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: (result as any).response.usageMetadata.promptTokenCount || 0,
                    outputTokens: (result as any).response.usageMetadata.candidatesTokenCount || 0,
                    model: SHARED_CONFIG.AI_MODELS.CHAT_MODEL,
                    timestamp: new Date()
                });
            }

            const responseText = (result as any).response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));
            await this.cacheService.createCache([{ text: responseText }], this.CACHE_TTL_SECONDS, cacheKey);
            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Video Analysis Failure", error as Error);
            throw error;
        }
    }

    async analyzeLiveImageFrame(
        imageData: string,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        inputTimestamp?: number,
        localTriage?: any
    ): Promise<any> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Live Image Frame Analysis", { sessionId, mimeType, userId });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User ID is required for image frame analysis access control.");
        }
        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User not found for image frame analysis access control.");
        }

        if (user.tier === 'free') {
            throw new AppError(ErrorCode.FORBIDDEN, "Free users do not have access to live video analysis.");
        }

        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const MAX_LIVE_VIDEO_MINUTES = 35;
        const FRAME_DURATION_MINUTES = 2 / 60;

        if (session.cumulativeVideoDurationProcessedMinutes >= MAX_LIVE_VIDEO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Live video analysis limit of ${MAX_LIVE_VIDEO_MINUTES} minutes reached for this session.`);
        }

        if (inputTimestamp && session.lastProcessedFrameTimestamp) {
            const timeSinceLastFrame = inputTimestamp - session.lastProcessedFrameTimestamp;
            const MIN_TIME_BETWEEN_FRAMES_MS = SHARED_CONFIG.SUBSCRIPTION.LIVE_VIDEO_MIN_TIME_BETWEEN_FRAMES_MS;

            if (timeSinceLastFrame < MIN_TIME_BETWEEN_FRAMES_MS) {
                this.logger.warn('Live video frame rejected: too soon after last frame.', { sessionId, timeSinceLastFrame });
                return null;
            }
        }

        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.LIVE_IMAGE_ANALYSIS(vehicleContext)}

        ${localTriage ? `\nLOCAL PERCEPTION GROUNDING:\n${JSON.stringify(localTriage, null, 2)}` : ''}
        `;

        const chat = this.model.startChat({
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: AI_GENERATION_CONFIGS.LIVE_VIDEO.thinkingConfig,
                temperature: AI_GENERATION_CONFIGS.LIVE_VIDEO.temperature,
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
                        detectedCondition: { type: SchemaType.STRING, enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'] },
                        confidence: { type: SchemaType.NUMBER },
                        verification: {
                            type: SchemaType.OBJECT,
                            properties: {
                                isVerified: { type: SchemaType.BOOLEAN },
                                verifiedSource: { type: SchemaType.STRING, nullable: true },
                                conflictingEvidence: { type: SchemaType.STRING, nullable: true }
                            },
                            required: ['isVerified']
                        }
                    },
                    required: ['safety_alert', 'severity', 'diagnosis', 'visual_evidence', 'acoustic_evidence', 'suggested_actions', 'engineDescription', 'isStock', 'visualConflictDetected', 'detectedCondition', 'confidence']
                }
            } as unknown as import('@google-cloud/vertexai').GenerationConfig
        });

        try {
            const userParts: Part[] = [
                { inlineData: { mimeType: mimeType, data: imageData } },
                { text: fullPrompt }
            ];

            const result = await this.tracer.traceAiCall({
                name: 'live_image_analysis_structured',
                inputs: { sessionId, mimeType, userId, inputTimestamp },
                exec: async () => chat.sendMessage(userParts)
            });

            if ((result as any).response.usageMetadata) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: (result as any).response.usageMetadata.promptTokenCount || 0,
                    outputTokens: (result as any).response.usageMetadata.candidatesTokenCount || 0,
                    model: SHARED_CONFIG.AI_MODELS.CHAT_MODEL,
                    timestamp: new Date()
                });
            }

            let response = (result as any).response;
            response = await this.functionCallService.handleFunctionCalls(
                response,
                chat,
                {
                    userId,
                    sessionId
                }
            );

            const finalCandidate = response.candidates?.[0];
            const contentParts = finalCandidate?.content?.parts || [];
            const functionCalls = contentParts.filter((p: Part) => p.functionCall).map((p: Part) => p.functionCall);

            if (functionCalls.length > 0) {
                const messageParts: MessagePart[] = [];
                const text = contentParts.find((p: Part) => p.text)?.text;
                if (text) messageParts.push({ type: 'text', text });

                for (const call of functionCalls) {
                    if (call) {
                        messageParts.push({
                            type: 'tool-call',
                            toolName: call.name,
                            toolCallId: 'call_' + Math.random().toString(36).substr(2, 9),
                            args: call.args
                        });
                    }
                }
                return messageParts;
            }

            const responseText = finalCandidate?.content?.parts?.[0]?.text;
            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response from image frame analysis");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));

            await this.sessionRepo.updateLastProcessedFrameTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeVideoDuration(sessionId, FRAME_DURATION_MINUTES);

            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Image Frame Analysis Failure", error as Error, { sessionId, userId });
            throw error;
        }
    }

    async analyzeLiveAudioChunk(
        audioData: string,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        audioChunkDurationSeconds: number,
        inputTimestamp?: number
    ): Promise<any> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Live Audio Chunk Analysis", { sessionId, mimeType, userId, audioChunkDurationSeconds });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User ID is required for live audio analysis access control.");
        }
        const user = await this.userRepo.findById(userId);

        if (!user) {
            throw new AppError(ErrorCode.UNAUTHORIZED, "User not found for live audio analysis access control.");
        }

        if (user.tier === 'free') {
            throw new AppError(ErrorCode.FORBIDDEN, "Free users do not have access to live audio analysis.");
        }

        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const MAX_PRO_AUDIO_MINUTES = SHARED_CONFIG.SUBSCRIPTION.PRO_USER_MAX_AUDIO_MINUTES;
        const LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS = SHARED_CONFIG.SUBSCRIPTION.LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS;

        const currentCumulativeAudioMinutes = session.cumulativeAudioDurationProcessedMinutes || 0;
        const newCumulativeAudioMinutes = currentCumulativeAudioMinutes + (audioChunkDurationSeconds / 60);

        if (newCumulativeAudioMinutes > MAX_PRO_AUDIO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Live audio analysis limit of ${MAX_PRO_AUDIO_MINUTES} minutes reached for this session.`);
        }

        if (inputTimestamp && session.lastProcessedAudioChunkTimestamp) {
            const timeSinceLastChunk = inputTimestamp - session.lastProcessedAudioChunkTimestamp;

            if (timeSinceLastChunk < LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS) {
                this.logger.warn('Live audio chunk rejected: too soon after last chunk.', { sessionId, timeSinceLastChunk });
                return null;
            }
        }

        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.LIVE_AUDIO_ANALYSIS(vehicleContext)}
        `;

        const chat = this.model.startChat({
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: AI_GENERATION_CONFIGS.LIVE_VIDEO.thinkingConfig,
                temperature: AI_GENERATION_CONFIGS.LIVE_VIDEO.temperature,
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
                        detectedCondition: { type: SchemaType.STRING, enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'] },
                        confidence: { type: SchemaType.NUMBER },
                        verification: {
                            type: SchemaType.OBJECT,
                            properties: {
                                isVerified: { type: SchemaType.BOOLEAN },
                                verifiedSource: { type: SchemaType.STRING, nullable: true },
                                conflictingEvidence: { type: SchemaType.STRING, nullable: true }
                            },
                            required: ['isVerified']
                        }
                    },
                    required: ['safety_alert', 'severity', 'diagnosis', 'visual_evidence', 'acoustic_evidence', 'suggested_actions', 'engineDescription', 'isStock', 'visualConflictDetected', 'detectedCondition', 'confidence']
                }
            } as unknown as import('@google-cloud/vertexai').GenerationConfig
        });

        try {
            const userParts: Part[] = [
                { inlineData: { mimeType: mimeType, data: audioData } },
                { text: fullPrompt }
            ];

            const result = await this.tracer.traceAiCall({
                name: 'live_audio_analysis_structured',
                inputs: { sessionId, mimeType, userId, audioChunkDurationSeconds, inputTimestamp },
                exec: async () => chat.sendMessage(userParts)
            });

            if ((result as any).response.usageMetadata) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: (result as any).response.usageMetadata.promptTokenCount || 0,
                    outputTokens: (result as any).response.usageMetadata.candidatesTokenCount || 0,
                    model: SHARED_CONFIG.AI_MODELS.LIVE_MODEL,
                    timestamp: new Date()
                });
            }

            let response = (result as any).response;
            response = await this.functionCallService.handleFunctionCalls(
                response,
                chat,
                {
                    userId,
                    sessionId
                }
            );

            const finalCandidate = response.candidates?.[0];
            const contentParts = finalCandidate?.content?.parts || [];
            const functionCalls = contentParts.filter((p: Part) => p.functionCall).map((p: Part) => p.functionCall);

            if (functionCalls.length > 0) {
                const messageParts: MessagePart[] = [];
                const text = contentParts.find((p: Part) => p.text)?.text;
                if (text) messageParts.push({ type: 'text', text });

                for (const call of functionCalls) {
                    if (call) {
                        messageParts.push({
                            type: 'tool-call',
                            toolName: call.name,
                            toolCallId: 'call_' + Math.random().toString(36).substr(2, 9),
                            args: call.args
                        });
                    }
                }
                return messageParts;
            }

            const responseText = finalCandidate?.content?.parts?.[0]?.text;
            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response from live audio analysis");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));

            await this.sessionRepo.updateLastProcessedAudioChunkTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeAudioDuration(sessionId, audioChunkDurationSeconds / 60);

            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Live Audio Analysis Failure", error as Error, { sessionId, userId });
            throw error;
        }
    }
}
