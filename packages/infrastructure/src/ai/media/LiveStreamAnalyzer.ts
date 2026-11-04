import { injectable, inject } from 'inversify';
import type {
    AIAnalysis,
    IBillingService,
    ILiveStreamAnalyzer,
    ILogger,
    IMediaAnalysisModel,
    ISessionRepository,
    IUserRepository,
    LocalTriageResult,
    MediaAnalysisRequest,
    MessagePart,
    DiagnosticSession,
} from '@lemonade/core';
import { AppError, ErrorCode, SHARED_CONFIG, SystemPrompts, VideoPrompts } from '@lemonade/core';
import { TYPES } from '../../di/types';
import { TracingService } from '../../observability/TracingService';
import { billMediaUsage, parseAnalysis, toolCallParts } from './mediaReply';

const MAX_LIVE_VIDEO_MINUTES = 35;
/** Each accepted frame stands for two seconds of live video against the session quota. */
const FRAME_DURATION_MINUTES = 2 / 60;

type LiveReply = AIAnalysis | MessagePart[] | null;

/**
 * Live camera frames and audio clips, analyzed through whichever media model is
 * bound. Owns the provider-neutral rules: paid tiers only, per-session minute
 * quotas, minimum spacing between inputs, billing and quota bookkeeping. Tool
 * calls the model makes are passed through to the client.
 */
@injectable()
export class LiveStreamAnalyzer implements ILiveStreamAnalyzer {
    constructor(
        @inject(TYPES.MediaAnalysisModel) private model: IMediaAnalysisModel,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.UserRepo) private userRepo: IUserRepository,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.TracingService) private tracer: TracingService,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    countTokens(content: string | MessagePart[]): Promise<number> {
        return this.model.countTokens(content);
    }

    async analyzeLiveImageFrame(
        imageData: string,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        vin?: string,
        inputTimestamp?: number,
        localTriage?: LocalTriageResult,
    ): Promise<LiveReply> {
        this.logger.debug(`Sending live frame to ${this.model.modelId}`, { sessionId, mimeType, userId });

        await this.requirePaidUser(userId, 'image frame', 'live video');
        const session = await this.requireSession(sessionId);

        if (session.cumulativeVideoDurationProcessedMinutes >= MAX_LIVE_VIDEO_MINUTES) {
            throw new AppError(
                ErrorCode.FORBIDDEN,
                `Live video analysis limit of ${MAX_LIVE_VIDEO_MINUTES} minutes reached for this session.`,
            );
        }

        const minGap = SHARED_CONFIG.SUBSCRIPTION.LIVE_VIDEO_MIN_TIME_BETWEEN_FRAMES_MS;
        if (inputTimestamp && session.lastProcessedFrameTimestamp) {
            const timeSinceLastFrame = inputTimestamp - session.lastProcessedFrameTimestamp;
            if (timeSinceLastFrame < minGap) {
                this.logger.warn('Live video frame rejected: too soon after last frame.', {
                    sessionId,
                    timeSinceLastFrame,
                });
                return null;
            }
        }

        const prompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.liveImageAnalysis(vehicleContext)}

        ${localTriage ? `\nLOCAL PERCEPTION GROUNDING:\n${JSON.stringify(localTriage, null, 2)}` : ''}
        `;

        try {
            const reply = await this.run(
                'live_image_analysis_structured',
                { sessionId, mimeType, userId, inputTimestamp },
                { prompt, media: { kind: 'image', mimeType, data: imageData } },
                { userId, sessionId, vin },
            );
            if (Array.isArray(reply)) return reply;

            const analysis = parseAnalysis(reply, 'AI returned empty response from image frame analysis');
            await this.sessionRepo.updateLastProcessedFrameTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeVideoDuration(sessionId, FRAME_DURATION_MINUTES);
            return analysis;
        } catch (error) {
            this.logger.error('Live Image Frame Analysis Failure', error as Error, { sessionId, userId });
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
        vin?: string,
        inputTimestamp?: number,
    ): Promise<LiveReply> {
        this.logger.debug(`Sending live audio to ${this.model.modelId}`, {
            sessionId,
            mimeType,
            userId,
            audioChunkDurationSeconds,
        });

        await this.requirePaidUser(userId, 'live audio', 'live audio');
        const session = await this.requireSession(sessionId);

        const maxMinutes = SHARED_CONFIG.SUBSCRIPTION.PRO_USER_MAX_AUDIO_MINUTES;
        const chunkMinutes = audioChunkDurationSeconds / 60;
        if ((session.cumulativeAudioDurationProcessedMinutes || 0) + chunkMinutes > maxMinutes) {
            throw new AppError(
                ErrorCode.FORBIDDEN,
                `Live audio analysis limit of ${maxMinutes} minutes reached for this session.`,
            );
        }

        const minGap = SHARED_CONFIG.SUBSCRIPTION.LIVE_AUDIO_MIN_TIME_BETWEEN_CHUNKS_MS;
        if (inputTimestamp && session.lastProcessedAudioChunkTimestamp) {
            const timeSinceLastChunk = inputTimestamp - session.lastProcessedAudioChunkTimestamp;
            if (timeSinceLastChunk < minGap) {
                this.logger.warn('Live audio chunk rejected: too soon after last chunk.', {
                    sessionId,
                    timeSinceLastChunk,
                });
                return null;
            }
        }

        const prompt = `
        ${SystemPrompts.identity()}
        ${SystemPrompts.primeDirectives()}

        ${VideoPrompts.liveAudioAnalysis(vehicleContext)}
        `;

        try {
            const reply = await this.run(
                'live_audio_analysis_structured',
                { sessionId, mimeType, userId, audioChunkDurationSeconds, inputTimestamp },
                { prompt, media: { kind: 'audio', mimeType, data: audioData } },
                { userId, sessionId, vin },
            );
            if (Array.isArray(reply)) return reply;

            const analysis = parseAnalysis(reply, 'AI returned empty response from live audio analysis');
            await this.sessionRepo.updateLastProcessedAudioChunkTimestamp(sessionId, inputTimestamp || Date.now());
            await this.sessionRepo.updateCumulativeAudioDuration(sessionId, chunkMinutes);
            return analysis;
        } catch (error) {
            this.logger.error('Live Audio Analysis Failure', error as Error, { sessionId, userId });
            throw error;
        }
    }

    /** Runs one traced, billed, tool-enabled realtime analysis; returns tool-call parts or the raw result. */
    private async run(
        traceName: string,
        traceInputs: Record<string, unknown>,
        input: Pick<MediaAnalysisRequest, 'prompt' | 'media'>,
        tools: { userId: string; sessionId: string; vin?: string },
    ) {
        const result = await this.tracer.traceAiCall({
            name: traceName,
            inputs: traceInputs,
            exec: () => this.model.analyze({ ...input, structured: true, realtime: true, tools }),
        });
        await billMediaUsage(this.billingService, result, tools.userId, tools.sessionId);
        return toolCallParts(result) ?? result;
    }

    private async requirePaidUser(userId: string, subject: string, feature: string): Promise<void> {
        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHORIZED, `User ID is required for ${subject} analysis access control.`);
        }
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new AppError(ErrorCode.UNAUTHORIZED, `User not found for ${subject} analysis access control.`);
        }
        if (user.tier === 'free') {
            throw new AppError(ErrorCode.FORBIDDEN, `Free users do not have access to ${feature} analysis.`);
        }
    }

    private async requireSession(sessionId: string): Promise<DiagnosticSession> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Session with ID ${sessionId} not found.`);
        }
        return session;
    }
}
