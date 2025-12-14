import { injectable, inject } from 'inversify';
import { GenerativeModel, SchemaType, Part } from '@google-cloud/vertexai'; // Added Part
import {
    ISessionRepository,
    IContextCacheService,
    IUserRepository,
    ILiveStreamAnalyzer,
    AIAnalysis,
    AIAnalysisSchema,
    VIDEO_PROMPTS,
    SYSTEM_PROMPTS,
    AppError,
    ErrorCode,
    ILogger,
    IBillingService,
    ReasoningEffort,
    AI_GENERATION_CONFIGS,
    AiGenerationConfig,
    MessagePart
} from '@lemonade/core';
import { CONFIG } from '@/infrastructure/config';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';
import { TYPES } from '@/infrastructure/di/types';
import { GeminiCoreAdapter } from './GeminiCoreAdapter';

@injectable()
export class GeminiFlashLiveStreamAdapter implements ILiveStreamAnalyzer {
    private model: GenerativeModel;
    private readonly CACHE_TTL_SECONDS = 3600 * 24; // 24 hours for video analysis cache

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
        @inject(TYPES.ContextCacheService) private cacheService: IContextCacheService,
        @inject(TYPES.UserRepo) private userRepo: IUserRepository,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
    ) {
        this.model = coreAdapter.getGenerativeModel(CONFIG.AI_MODELS.LIVE_MODEL, [], coreAdapter.commonSafetySettings); // Use LIVE_MODEL
        this.logger.info(`GeminiFlashLiveStreamAdapter initialized, using model: ${CONFIG.AI_MODELS.LIVE_MODEL}`);
    }

    async countTokens(content: string | import('@/core/types/models').MessagePart[] | Part[]): Promise<number> {
        let parts: Part[] = [];

        if (typeof content === 'string') {
            parts = [{ text: content }];
        } else if (Array.isArray(content)) {
            // Determine if it's MessagePart[] or raw Part[]
            if (content.length > 0 && ('type' in content[0] || 'text' in content[0] || 'inlineData' in content[0] || 'fileData' in content[0])) {
                // Assume MessagePart[]
                parts = (content as import('@/core/types/models').MessagePart[]).map(part => {
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
                    if (part.type === 'audio' && part.data) { // Assuming audio data is base64 in `data` field
                        // For token counting, we only need basic info or mimeType. Actual audio data encoding is different.
                        // For now, let's represent it as a text placeholder for token estimation
                        return { text: `[Audio Content: ${part.data}]` };
                    }
                    return { text: '' }; // Fallback
                }).filter(p => ('text' in p && p.text !== '') || ('fileData' in p) || ('inlineData' in p));
            } else {
                // Assume raw Part[]
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
            this.logger.error("countTokens failed", error);
            return 0;
        }
    }

    private getGenerationConfigForVideo(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === "none") return AI_GENERATION_CONFIGS.LIVE_VIDEO;
        // Default to none for video to ensure max speed
        return AI_GENERATION_CONFIGS.LIVE_VIDEO;
    }

    async analyzeFullVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number // Added
    ): Promise<AIAnalysis> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Full Video Analysis", { videoUrl, mimeType, videoDurationMinutes });

        // --- Tiered Access Control ---
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

        // Pro user video duration limit
        const MAX_PRO_VIDEO_MINUTES = 35;
        if (user.tier === 'pro' && videoDurationMinutes !== undefined && videoDurationMinutes > MAX_PRO_VIDEO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Video exceeds maximum duration of ${MAX_PRO_VIDEO_MINUTES} minutes for Pro users.`);
        }
        // --- End Tiered Access Control ---

        const cacheKeyData = { videoUrl, vehicleContext, mimeType, reasoningEffort, videoDurationMinutes }; // Added videoDurationMinutes to cache key
        const cacheKey = `analyzeVideo-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info('Cache hit for analyzeMechanicalVideo', { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        // Merge system instruction into the user prompt
        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}
        `;

        const genConfig = this.getGenerationConfigForVideo(reasoningEffort);

        // Get the model from this adapter
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
                responseSchema: { // Re-added responseSchema for structured output
                    type: SchemaType.OBJECT,
                    properties: {
                        safety_alert: { type: SchemaType.BOOLEAN },
                        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
                        diagnosis: { type: SchemaType.STRING },
                        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        // Add neuro-symbolic specific fields as per AIAnalysisSchema
                        engineDescription: { type: SchemaType.STRING },
                        isStock: { type: SchemaType.BOOLEAN },
                        visualConflictDetected: { type: SchemaType.BOOLEAN },
                        detectedCondition: { type: SchemaType.STRING, enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'] },
                        confidence: { type: SchemaType.NUMBER },
                        verification: { // Optional verification sub-object
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
            } as unknown as import('@google-cloud/vertexai').GenerationConfig // Cast needed for types
        };

        try {
            const result = await traceAiCall({
                name: 'video_diagnostic_structured',
                inputs: { videoUrl, vehicleContext, mimeType },
                exec: async () => model.generateContent(request)
            });

            // Billing Ledger Optimization: Record Usage
            if (result.response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.CHAT_MODEL, // Use CHAT_MODEL from config
                    timestamp: new Date()
                });
            }

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));
            await this.cacheService.createCache([{ text: responseText }], this.CACHE_TTL_SECONDS, cacheKey); // Cache the raw JSON text
            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Video Analysis Failure", error);
            throw error;
        }
    }

    async analyzeLiveImageFrame(
        imageData: string, // Base64 encoded image data
        mimeType: string, // e.g., 'image/jpeg', 'image/png'
        vehicleContext: string,
        userId: string,
        sessionId: string,
        inputTimestamp?: number // Optional: timestamp of the frame from client for auditing/tracking (ms)
    ): Promise<AIAnalysis | null> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Live Image Frame Analysis", { sessionId, mimeType, userId });

        // --- Tiered Access Control (User) ---
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

        // --- Session State & Duration Control ---
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const MAX_LIVE_VIDEO_MINUTES = 35;
        const FRAME_DURATION_MINUTES = 2 / 60; // 0.5 FPS = 1 frame every 2 seconds = 2 seconds per frame

        // Check cumulative duration
        if (session.cumulativeVideoDurationProcessedMinutes >= MAX_LIVE_VIDEO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Live video analysis limit of ${MAX_LIVE_VIDEO_MINUTES} minutes reached for this session.`);
        }

        // --- Frame Rate Control (0.5 FPS = 1 frame every 2 seconds) ---
        if (inputTimestamp && session.lastProcessedFrameTimestamp) {
            const timeSinceLastFrame = inputTimestamp - session.lastProcessedFrameTimestamp; // in ms
            const MIN_TIME_BETWEEN_FRAMES_MS = CONFIG.SUBSCRIPTION.LIVE_VIDEO_MIN_TIME_BETWEEN_FRAMES_MS;

            if (timeSinceLastFrame < MIN_TIME_BETWEEN_FRAMES_MS) {
                // Too many frames too quickly. Reject to enforce rate limit.
                this.logger.warn('Live video frame rejected: too soon after last frame.', { sessionId, timeSinceLastFrame });
                // We return null here as it's not an error but an intentional rate limit.
                // The client should receive a signal to wait.
                return null;
            }
        }

        // --- AI Processing ---
        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.LIVE_IMAGE_ANALYSIS(vehicleContext)}
        `;

        const model = this.model;

        // Construct request for image data
        const request = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: imageData // Base64 data
                        }
                    },
                    { text: fullPrompt }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json', // Assuming structured JSON response from AI
                thinkingConfig: AI_GENERATION_CONFIGS.LIVE_VIDEO.thinkingConfig,
                temperature: AI_GENERATION_CONFIGS.LIVE_VIDEO.temperature,
                responseSchema: { // Explicitly define responseSchema for structured output
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
            const result = await traceAiCall({
                name: 'live_image_analysis_structured',
                inputs: { sessionId, mimeType, userId, inputTimestamp },
                exec: async () => model.generateContent(request)
            });

            // Billing Ledger Optimization: Record Usage
            if (result.response.usageMetadata) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.CHAT_MODEL,
                    timestamp: new Date()
                });
            }

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response from image frame analysis");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));

            // Update session state for next frame and cumulative duration
            await this.sessionRepo.updateLastProcessedFrameTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeVideoDuration(sessionId, FRAME_DURATION_MINUTES);

            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Image Frame Analysis Failure", error, { sessionId, userId });
            throw error;
        }
    }

    async analyzeLiveAudioChunk(
        audioData: string, // Base64 encoded audio data
        mimeType: string, // e.g., 'audio/webm', 'audio/wav'
        vehicleContext: string,
        userId: string,
        sessionId: string,
        audioChunkDurationSeconds: number,
        inputTimestamp?: number
    ): Promise<AIAnalysis | null> {
        this.logger.debug("Sending to Vertex AI (Structured Output) for Live Audio Chunk Analysis", { sessionId, mimeType, userId, audioChunkDurationSeconds });

        // --- Tiered Access Control (User) ---
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

        // --- Session State & Duration Control ---
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }

        const MAX_PRO_AUDIO_MINUTES = CONFIG.SUBSCRIPTION.PRO_USER_MAX_AUDIO_MINUTES;
        const LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS = CONFIG.SUBSCRIPTION.LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS;

        // Check cumulative duration for audio
        const currentCumulativeAudioMinutes = session.cumulativeAudioDurationProcessedMinutes || 0;
        const newCumulativeAudioMinutes = currentCumulativeAudioMinutes + (audioChunkDurationSeconds / 60);

        if (newCumulativeAudioMinutes > MAX_PRO_AUDIO_MINUTES) {
            throw new AppError(ErrorCode.FORBIDDEN, `Live audio analysis limit of ${MAX_PRO_AUDIO_MINUTES} minutes reached for this session.`);
        }

        // --- Rate Limiting Control ---
        if (inputTimestamp && session.lastProcessedAudioChunkTimestamp) {
            const timeSinceLastChunk = inputTimestamp - session.lastProcessedAudioChunkTimestamp; // in ms

            if (timeSinceLastChunk < LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS) {
                // Too many chunks too quickly. Reject to enforce rate limit.
                this.logger.warn('Live audio chunk rejected: too soon after last chunk.', { sessionId, timeSinceLastChunk });
                return null;
            }
        }

        // --- AI Processing ---
        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.LIVE_AUDIO_ANALYSIS(vehicleContext)}
        `;

        const model = this.model; // Use the LIVE_MODEL

        const request = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: audioData // Base64 audio data
                        }
                    },
                    { text: fullPrompt }
                ]
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: AI_GENERATION_CONFIGS.LIVE_VIDEO.thinkingConfig, // Reusing LIVE_VIDEO config, adjust if needed
                temperature: AI_GENERATION_CONFIGS.LIVE_VIDEO.temperature,
                responseSchema: { // Explicitly define responseSchema for structured output
                    type: SchemaType.OBJECT,
                    properties: {
                        safety_alert: { type: SchemaType.BOOLEAN },
                        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
                        diagnosis: { type: SchemaType.STRING },
                        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        engineDescription: { type: SchemaType.STRING }, // Still present, but AI should mark as N/A or empty for audio-only
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
            const result = await traceAiCall({
                name: 'live_audio_analysis_structured',
                inputs: { sessionId, mimeType, userId, audioChunkDurationSeconds, inputTimestamp },
                exec: async () => model.generateContent(request)
            });

            // Billing Ledger Optimization: Record Usage
            if (result.response.usageMetadata) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.LIVE_MODEL, // Use LIVE_MODEL
                    timestamp: new Date()
                });
            }

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response from live audio analysis");

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));

            // Update session state for next chunk and cumulative duration
            await this.sessionRepo.updateLastProcessedAudioChunkTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeAudioDuration(sessionId, audioChunkDurationSeconds / 60);

            return analysis;

        } catch (error) {
            this.logger.error("Vertex AI Live Audio Analysis Failure", error, { sessionId, userId });
            throw error;
        }
    }
}
