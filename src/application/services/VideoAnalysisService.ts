import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { ISessionRepository, IVehicleRepository, IMechanicReasoningService, ILogger } from '@lemonade/core';
import {
    IVideoAnalysisService,
    AIAnalysis,
    AppError,
    ErrorCode
} from '@lemonade/core';

@injectable()
export class VideoAnalysisService implements IVideoAnalysisService {
    constructor(
        @inject(TYPES.MechanicReasoningService) private mechanicReasoning: IMechanicReasoningService,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async processVideoUpload(sessionId: string, videoUrl: string, videoDurationMinutes?: number) {
        this.logger.info('[VideoAnalysisService] processVideoUpload started', { sessionId, videoUrl, videoDurationMinutes });

        try {
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

            await this.sessionRepo.addMessage(sessionId, 'user', [
                { type: 'text', text: `[System] User uploaded a video for mechanical analysis: ${videoUrl}` }
            ]);
            this.logger.info('[VideoAnalysisService] Added user message for video', { sessionId });

            await this.sessionRepo.updateStatus(sessionId, 'analyzing');
            await this.sessionRepo.updateVideo(sessionId, videoUrl);

            this.logger.info('[VideoAnalysisService] Delegating to Mechanic Reasoning Machine...', { sessionId });

            let videoUri = videoUrl;

            try {
                if (videoUrl.includes('storage.googleapis.com')) {
                    const urlObj = new URL(videoUrl);
                    const pathParts = urlObj.pathname.split('/').filter(Boolean);
                    if (pathParts.length >= 2) {
                        videoUri = `gs://${pathParts.join('/')}`;
                    }
                }
            } catch {
                this.logger.warn('Failed to parse video URL for GCS optimization', { videoUrl });
            }

            const reasoningState = await this.mechanicReasoning.diagnose({
                userId: session.userId,
                sessionId: session.id,
                userQuery: "Analyze this video for mechanical issues.",
                videoUrl: videoUri,
                vehicleContext: vehicle.specs,
                videoDurationMinutes: videoDurationMinutes,
            });

            const finalVerdict = reasoningState.finalDiagnosis;
            this.logger.info('[VideoAnalysisService] Reasoning Complete', { decision: finalVerdict.decision });

            const summaryMessage = `I've analyzed the video.
**Diagnosis:** ${finalVerdict.userOutput}
**Reasoning:** ${finalVerdict.reasoningTrace}
${finalVerdict.requiredActions.length > 0 ? '**Suggested Actions:**\n- ' + finalVerdict.requiredActions.join('\n- ') : ''}`;

            await this.sessionRepo.addMessage(sessionId, 'assistant', [
                { type: 'text', text: summaryMessage }
            ]);

            if (finalVerdict.decision === 'STOP_DANGER') {
                await this.sessionRepo.flagSafetyStop(sessionId, finalVerdict.userOutput);
            }

            const analysisAdapter: AIAnalysis = {
                diagnosis: finalVerdict.userOutput,
                visual_evidence: reasoningState.intuition.reasoning.split('; '),
                acoustic_evidence: [],
                severity: (finalVerdict.decision === 'STOP_DANGER' ? 'critical' :
                    finalVerdict.decision === 'REQUEST_MORE_INFO' ? 'medium' :
                        'low'),
                safety_alert: finalVerdict.decision === 'STOP_DANGER',
                suggested_actions: finalVerdict.requiredActions,
                engineDescription: reasoningState.visualGrounding.engineDescription,
                isStock: reasoningState.visualGrounding.isStock,
                visualConflictDetected: reasoningState.visualGrounding.visualConflictDetected,
                detectedCondition: reasoningState.visualGrounding.detectedCondition,
                confidence: reasoningState.intuition.confidence,
                verification: {
                    isVerified: reasoningState.verification.isVerified,
                    verifiedSource: reasoningState.verification.verifiedSource,
                    conflictingEvidence: reasoningState.verification.conflictingEvidence
                }
            };

            await this.sessionRepo.updateAnalysis(sessionId, analysisAdapter);
            this.logger.info('[VideoAnalysisService] Analysis saved', { sessionId });

        } catch (error) {
            this.logger.error('[VideoAnalysisService] Video processing failed', error, { sessionId });
            await this.sessionRepo.updateStatus(sessionId, 'active');
            throw error;
        }
    }

    async analyzeVideo(
        url: string,
        context: string,
        mimeType: string,
        userId: string,
        sessionId: string
        ): Promise<AIAnalysis> {
        this.logger.info('[VideoAnalysisService] analyzeVideo called', { sessionId, url });

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

        const reasoningState = await this.mechanicReasoning.diagnose({
            userId,
            sessionId,
            userQuery: context || "Analyze this video.",
            videoUrl: url,
            vehicleContext: vehicle.specs
        });

        const finalVerdict = reasoningState.finalDiagnosis;

        return {
            diagnosis: finalVerdict.userOutput,
            visual_evidence: reasoningState.intuition.reasoning.split('; '),
            acoustic_evidence: [],
            severity: (finalVerdict.decision === 'STOP_DANGER' ? 'critical' :
                finalVerdict.decision === 'REQUEST_MORE_INFO' ? 'medium' :
                    'low'),
            safety_alert: finalVerdict.decision === 'STOP_DANGER',
            suggested_actions: finalVerdict.requiredActions,
            engineDescription: reasoningState.visualGrounding.engineDescription,
            isStock: reasoningState.visualGrounding.isStock,
            visualConflictDetected: reasoningState.visualGrounding.visualConflictDetected,
            detectedCondition: reasoningState.visualGrounding.detectedCondition,
            confidence: reasoningState.intuition.confidence,
            verification: {
                isVerified: reasoningState.verification.isVerified,
                verifiedSource: reasoningState.verification.verifiedSource,
                conflictingEvidence: reasoningState.verification.conflictingEvidence
            }
        };
    }
}
