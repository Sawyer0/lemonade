import type { GenerateContentResult, GenerationConfig, GenerativeModel } from '@google-cloud/vertexai';
import type { AIAnalysis, IBillingService, IContextCacheService, ILogger, ReasoningEffort } from '@lemonade/core';
import { AIAnalysisSchema, AppError, ErrorCode, SystemPrompts, VideoPrompts } from '@lemonade/core';
import type { TracingService } from '../../observability/TracingService';
import { generationConfigForEffort } from './generationConfig';
import { ANALYSIS_RESPONSE_SCHEMA } from './responseSchemas';
import { recordChatModelUsage } from './usageRecorder';

export type UploadKind = 'video' | 'image';

export interface UploadAnalysisRequest {
    kind: UploadKind;
    fileUrl: string;
    vehicleContext: string;
    mimeType: string;
    userId?: string;
    sessionId?: string;
    reasoningEffort?: ReasoningEffort;
    videoDurationMinutes?: number;
}

const CACHE_TTL_SECONDS = 3600;

const KIND_LABEL: Record<UploadKind, { cachePrefix: string; traceName: string; title: string }> = {
    video: {
        cachePrefix: 'analyzeUploadedVideo',
        traceName: 'uploaded_video_diagnostic_structured',
        title: 'Video',
    },
    image: {
        cachePrefix: 'analyzeUploadedImage',
        traceName: 'uploaded_image_diagnostic_structured',
        title: 'Image',
    },
};

/**
 * Diagnoses an uploaded photo or video with structured output, billing the
 * user and caching the parsed analysis for an hour.
 */
export class GeminiUploadAnalyzer {
    constructor(
        private readonly model: GenerativeModel,
        private readonly billingService: IBillingService,
        private readonly cacheService: IContextCacheService,
        private readonly tracer: TracingService,
        private readonly logger: ILogger,
    ) {}

    async analyze(req: UploadAnalysisRequest): Promise<AIAnalysis> {
        const { kind, fileUrl, vehicleContext, mimeType, userId, sessionId, reasoningEffort } = req;
        const label = KIND_LABEL[kind];
        const lower = label.title.toLowerCase();

        this.logger.debug(`Sending to Vertex AI (Structured Output) for Uploaded ${label.title} Analysis`, {
            [`${lower}Url`]: fileUrl,
            mimeType,
            ...(kind === 'video' ? { videoDurationMinutes: req.videoDurationMinutes } : {}),
        });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, `User ID is required for uploaded ${lower} analysis billing.`);
        }

        const cacheKeyData =
            kind === 'video'
                ? {
                      videoUrl: fileUrl,
                      vehicleContext,
                      mimeType,
                      reasoningEffort,
                      videoDurationMinutes: req.videoDurationMinutes,
                  }
                : { imageUrl: fileUrl, vehicleContext, mimeType, reasoningEffort };
        const cacheKey = `${label.cachePrefix}-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info(`Cache hit for ${label.cachePrefix}`, { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        const fullPrompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.analysis(vehicleContext)}
        `;

        const genConfig = generationConfigForEffort(reasoningEffort);

        const request = {
            contents: [
                {
                    role: 'user',
                    parts: [{ fileData: { mimeType, fileUri: fileUrl } }, { text: fullPrompt }],
                },
            ],
            // thinkingConfig is accepted by the API but missing from the SDK's types.
            generationConfig: {
                responseMimeType: 'application/json',
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseSchema: ANALYSIS_RESPONSE_SCHEMA,
            } as unknown as GenerationConfig,
        };

        try {
            const result = (await this.tracer.traceAiCall({
                name: label.traceName,
                inputs: { [`${lower}Url`]: fileUrl, vehicleContext, mimeType },
                exec: async () => this.model.generateContent(request),
            })) as unknown as GenerateContentResult;

            if (result.response.usageMetadata && sessionId) {
                await recordChatModelUsage(this.billingService, result.response.usageMetadata, userId, sessionId);
            }

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) {
                throw new AppError(
                    ErrorCode.AI_SERVICE_ERROR,
                    `AI returned empty response for uploaded ${lower} analysis`,
                );
            }

            const analysis = AIAnalysisSchema.parse(JSON.parse(responseText));
            await this.cacheService.createCache([{ text: responseText }], CACHE_TTL_SECONDS, cacheKey);
            return analysis;
        } catch (error) {
            this.logger.error(`Vertex AI Uploaded ${label.title} Analysis Failure`, error);
            throw error;
        }
    }
}
