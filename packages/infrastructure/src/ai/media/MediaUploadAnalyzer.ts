import { injectable, inject } from 'inversify';
import type {
    AIAnalysis,
    IBillingService,
    IContextCacheService,
    ILogger,
    IMediaAnalysisModel,
    IMultimodalUploadAnalyzer,
    MediaKind,
    MessagePart,
    ReasoningEffort,
} from '@lemonade/core';
import { AIAnalysisSchema, AppError, ErrorCode, SystemPrompts, VideoPrompts } from '@lemonade/core';
import { TYPES } from '../../di/types';
import { TracingService } from '../../observability/TracingService';
import { billMediaUsage, parseAnalysis } from './mediaReply';

const CACHE_TTL_SECONDS = 3600;

interface UploadRequest {
    kind: Extract<MediaKind, 'image' | 'video'>;
    fileUrl: string;
    vehicleContext: string;
    mimeType: string;
    userId?: string;
    sessionId?: string;
    reasoningEffort?: ReasoningEffort;
    videoDurationMinutes?: number;
}

/**
 * Diagnoses an uploaded photo or video through whichever media model is bound,
 * billing the user and caching the parsed analysis for an hour.
 */
@injectable()
export class MediaUploadAnalyzer implements IMultimodalUploadAnalyzer {
    constructor(
        @inject(TYPES.MediaAnalysisModel) private model: IMediaAnalysisModel,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.ContextCacheService) private cacheService: IContextCacheService,
        @inject(TYPES.TracingService) private tracer: TracingService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    analyzeUploadedVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number,
    ): Promise<AIAnalysis> {
        return this.analyze({
            kind: 'video',
            fileUrl: videoUrl,
            vehicleContext,
            mimeType,
            userId,
            sessionId,
            reasoningEffort,
            videoDurationMinutes,
        });
    }

    analyzeUploadedImage(
        imageUrl: string,
        vehicleContext: string,
        mimeType: string = 'image/jpeg',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
    ): Promise<AIAnalysis> {
        return this.analyze({
            kind: 'image',
            fileUrl: imageUrl,
            vehicleContext,
            mimeType,
            userId,
            sessionId,
            reasoningEffort,
        });
    }

    countTokens(content: string | MessagePart[]): Promise<number> {
        return this.model.countTokens(content);
    }

    private async analyze(req: UploadRequest): Promise<AIAnalysis> {
        const { kind, fileUrl, vehicleContext, mimeType, userId, sessionId, reasoningEffort } = req;
        const title = kind === 'video' ? 'Video' : 'Image';
        const urlKey = `${kind}Url`;

        this.logger.debug(`Sending uploaded ${kind} to ${this.model.modelId} for structured analysis`, {
            [urlKey]: fileUrl,
            mimeType,
            ...(kind === 'video' ? { videoDurationMinutes: req.videoDurationMinutes } : {}),
        });

        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, `User ID is required for uploaded ${kind} analysis billing.`);
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
        const cacheKey = `analyzeUploaded${title}-${JSON.stringify(cacheKeyData)}`;
        const existingCache = await this.cacheService.getCache(cacheKey);

        if (existingCache) {
            this.logger.info(`Cache hit for analyzeUploaded${title}`, { cacheKey });
            return AIAnalysisSchema.parse(JSON.parse(existingCache as string));
        }

        const prompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.analysis(vehicleContext)}
        `;

        try {
            const result = await this.tracer.traceAiCall({
                name: `uploaded_${kind}_diagnostic_structured`,
                inputs: { [urlKey]: fileUrl, vehicleContext, mimeType },
                exec: () =>
                    this.model.analyze({
                        prompt,
                        media: { kind, mimeType, uri: fileUrl },
                        structured: true,
                        reasoningEffort,
                    }),
            });

            if (sessionId) await billMediaUsage(this.billingService, result, userId, sessionId);

            const analysis = parseAnalysis(result, `AI returned empty response for uploaded ${kind} analysis`);
            await this.cacheService.createCache([{ text: result.text ?? '' }], CACHE_TTL_SECONDS, cacheKey);
            return analysis;
        } catch (error) {
            this.logger.error(`Uploaded ${title} Analysis Failure`, error);
            throw error;
        }
    }
}
