import { createHash } from 'crypto';
import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IVideoAnalysisService } from '@/core/interfaces/IVideoAnalysisService';
import type { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import type { IContextCacheService } from '@/core/interfaces/IContextCacheService';
import type { IMechanicReasoningService } from '@/core/interfaces/IMechanicReasoningService';
import type { ILogger } from '@/core/interfaces/ILogger';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class VideoAnalysisService implements IVideoAnalysisService {
    constructor(
        @inject(TYPES.VideoAI) private videoAI: IVideoDiagnosticAI,
        @inject(TYPES.MechanicReasoningService) private mechanicReasoning: IMechanicReasoningService, // Injected System 2
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.ContextCacheService) private contextCache: IContextCacheService,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async processVideoUpload(sessionId: string, videoUrl: string) {
        this.logger.info('[VideoAnalysisService] processVideoUpload started', { sessionId, videoUrl });

        try {
            // 1. Retrieve Context
            const session = await this.sessionRepo.findById(sessionId);
            if (!session) {
                this.logger.error('[VideoAnalysisService] Session not found', { sessionId });
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");
            }

            const vehicle = await this.vehicleRepo.findById(session.vehicleId);
            if (!vehicle) {
                this.logger.error('[VideoAnalysisService] Vehicle not found', { vehicleId: session.vehicleId });
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");
            }

            const context = `${vehicle.specs.year} ${vehicle.specs.make} ${vehicle.specs.model} ${vehicle.specs.engine}`;

            // 2. Persist User Message (Requirements: "User sent an attachment")
            await this.sessionRepo.addMessage(sessionId, 'user', [
                { type: 'text', text: `[System] User uploaded a video for mechanical analysis: ${videoUrl}` }
            ]);
            this.logger.info('[VideoAnalysisService] Added user message for video', { sessionId });

            // 3. Update Status
            await this.sessionRepo.updateStatus(sessionId, 'analyzing');
            await this.sessionRepo.updateVideo(sessionId, videoUrl);

            // 4. Call Gemini 3 Pro
            this.logger.info('[VideoAnalysisService] Calling VideoAI...', { sessionId });

            // Convert public URL to gs:// URI for Vertex AI
            // Input: https://storage.googleapis.com/BUCKET_NAME/PATH/TO/FILE
            // Output: gs://BUCKET_NAME/PATH/TO/FILE
            let videoUri = videoUrl;
            let mimeType = 'video/mp4';

            try {
                // Infer MIME type from extension
                const extension = videoUrl.split('.').pop()?.toLowerCase();
                if (extension === 'mov' || extension === 'qt' || extension === 'quicktime') {
                    mimeType = 'video/mp4'; // Map MOV to MP4 for consistent processing
                } else if (extension === 'webm') {
                    mimeType = 'video/webm';
                } else if (extension === 'avi') {
                    mimeType = 'video/avi';
                }

                if (videoUrl.includes('storage.googleapis.com')) {
                    const urlObj = new URL(videoUrl);
                    const pathParts = urlObj.pathname.split('/').filter(Boolean);
                    if (pathParts.length >= 2) {
                        videoUri = `gs://${pathParts.join('/')}`;
                        this.logger.info('Converted storage URL to GCS URI', {
                            original: videoUrl,
                            gcsUri: videoUri,
                            mimeType
                        });
                    }
                } else if (videoUrl.startsWith('http')) {
                    this.logger.info('Using direct video URL', { videoUrl, mimeType });
                } else if (videoUrl.startsWith('gs://')) {
                    this.logger.info('Using GCS URI directly', { videoUrl, mimeType });
                } else {
                    this.logger.warn('Unrecognized video URL format', { videoUrl });
                }
            } catch (e) {
                this.logger.error('Error processing video URL', { error: e, videoUrl });
                throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid video URL format');
            }

            // Log the final values being sent to the AI
            this.logger.info('Sending video for analysis', {
                videoUri,
                mimeType,
                isGcs: videoUri.startsWith('gs://')
            });

            const analysis = await this.videoAI.analyzeMechanicalVideo(
                videoUri,
                context,
                mimeType,
                session.userId,
                sessionId,
                "none" // Added reasoningEffort for Live Video
            );
            this.logger.info('[VideoAnalysisService] VideoAI Analysis complete', { sessionId, hasAlert: !!analysis.safety_alert });

            // Post analysis summary to chat
            const summaryMessage = `I've analyzed the video.
**Diagnosis:** ${analysis.diagnosis}
**Severity:** ${analysis.severity.toUpperCase()}
${analysis.suggested_actions.length > 0 ? '**Suggested Actions:**\n- ' + analysis.suggested_actions.join('\n- ') : ''}`;

            await this.sessionRepo.addMessage(sessionId, 'assistant', [
                { type: 'text', text: summaryMessage }
            ]);

            // 5. Safety Enforcer
            if (analysis.safety_alert) {
                await this.sessionRepo.flagSafetyStop(sessionId, "Safety Alert Triggered by AI Analysis");
            }

            // 6. Save Results
            await this.sessionRepo.updateAnalysis(sessionId, analysis);
            this.logger.info('[VideoAnalysisService] Analysis saved', { sessionId });

        } catch (error) {
            this.logger.error('[VideoAnalysisService] Video processing failed', error, { sessionId });
            await this.sessionRepo.updateStatus(sessionId, 'active');
            throw error; // Re-throw so the caller (route) sees it if awaiting, or background logger catches it
        }
    }

    async analyzeManual(sessionId: string, manualUrl: string, query: string): Promise<string> {
        this.logger.info('[VideoAnalysisService] analyzeManual started', { sessionId, manualUrl });

        try {
            // 1. Resolve GCS URI
            let fileUri = manualUrl;
            if (manualUrl.includes('storage.googleapis.com')) {
                const urlObj = new URL(manualUrl);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts.length >= 2) {
                    fileUri = `gs://${pathParts.join('/')}`;
                }
            }

            // 2. Deterministic Cache Key
            // Generate a stable hash from the URI to identify this specific document version
            const manualHash = createHash('sha256').update(fileUri).digest('hex').substring(0, 16);
            const cacheDisplayName = `manual-${manualHash}`;

            let cacheName = await this.contextCache.findCacheByDisplayName(cacheDisplayName);

            if (cacheName) {
                this.logger.info('[VideoAnalysisService] Reusing existing context cache', { cacheDisplayName, cacheName });
            } else {
                this.logger.info('[VideoAnalysisService] Creating new context cache', { cacheDisplayName });
                cacheName = await this.contextCache.createCache(
                    [{ fileData: { mimeType: 'application/pdf', fileUri } }],
                    3600, // 1 hour TTL
                    cacheDisplayName
                );
            }

            // 3. Call AI with Cache
            if (!this.videoAI.analyzeManual) {
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, "VideoAI does not support manual analysis");
            }

            // Verify we have a valid cacheName before calling
            if (!cacheName) {
                throw new AppError(ErrorCode.AI_SERVICE_ERROR, "Failed to resolve context cache");
            }

            const session = await this.sessionRepo.findById(sessionId); // Need session for userId
            if (!session) { /* Handle error */ throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found"); }

            const result = await this.videoAI.analyzeManual(
                fileUri,
                query,
                cacheName,
                session.userId, // Added
                sessionId, // Added
                "high" // Added reasoningEffort for Manual Reader
            );

            // 4. Store result in chat
            await this.sessionRepo.addMessage(sessionId, 'assistant', [
                { type: 'text', text: `📚 **Manual Analysis**: ${result}` }
            ]);

            return result;

        } catch (error) {
            this.logger.error('[VideoAnalysisService] Manual analysis failed', error, { sessionId });
            throw error;
        }
    }
}
