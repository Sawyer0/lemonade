import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '@/infrastructure/di/types';
import type {
    IVideoDiagnosticAI,
    IChatAssistantAI
} from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';


import type { IChatService } from '@/core/interfaces/IChatService';
import type { IVideoAnalysisService } from '@/core/interfaces/IVideoAnalysisService';
import type { ISessionService } from '@/core/interfaces/ISessionService';
import type { IVoiceService } from '@/core/interfaces/IVoiceService';

import type { ILogger } from '@/core/interfaces/ILogger';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';

import { Vehicle } from '@/core/entities/Vehicle';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class DiagnosticService implements IChatService, IVideoAnalysisService, ISessionService, IVoiceService {
    constructor(
        @inject(TYPES.VideoAI) private videoAI: IVideoDiagnosticAI, // Gemini 3 Pro
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,     // Gemini Flash
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async processVideoUpload(sessionId: string, videoUrl: string) {
        this.logger.info('[DiagnosticService] processVideoUpload started', { sessionId, videoUrl });

        try {
            // 1. Retrieve Context
            const session = await this.sessionRepo.findById(sessionId);
            if (!session) {
                this.logger.error('[DiagnosticService] Session not found', { sessionId });
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");
            }

            const vehicle = await this.vehicleRepo.findById(session.vehicleId);
            if (!vehicle) {
                this.logger.error('[DiagnosticService] Vehicle not found', { vehicleId: session.vehicleId });
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");
            }

            const context = `${vehicle.specs.year} ${vehicle.specs.make} ${vehicle.specs.model} ${vehicle.specs.engine}`;

            // 2. Persist User Message (Requirements: "User sent an attachment")
            await this.sessionRepo.addMessage(sessionId, 'user', [
                { type: 'text', text: `[System] User uploaded a video for mechanical analysis: ${videoUrl}` }
            ]);
            this.logger.info('[DiagnosticService] Added user message for video', { sessionId });

            // 3. Update Status
            await this.sessionRepo.updateStatus(sessionId, 'analyzing');
            await this.sessionRepo.updateVideo(sessionId, videoUrl);

            // 4. Call Gemini 3 Pro
            this.logger.info('[DiagnosticService] Calling VideoAI...', { sessionId });

            // Convert public URL to gs:// URI for Vertex AI
            // Input: https://storage.googleapis.com/BUCKET_NAME/PATH/TO/FILE
            // Output: gs://BUCKET_NAME/PATH/TO/FILE
            let videoUri = videoUrl;
            let mimeType = 'video/mp4';

            try {
                // Infer MIME type from extension
                const extension = videoUrl.split('.').pop()?.toLowerCase();
                if (extension === 'mov' || extension === 'qt' || extension === 'quicktime') {
                    mimeType = 'video/mp4'; // Lie to API: Force mp4 for compatibility
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

            const analysis = await this.videoAI.analyzeMechanicalVideo(videoUri, context, mimeType);
            this.logger.info('[DiagnosticService] VideoAI Analysis complete', { sessionId, hasAlert: !!analysis.safety_alert });

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
            this.logger.info('[DiagnosticService] Analysis saved', { sessionId });

        } catch (error) {
            this.logger.error('[DiagnosticService] Video processing failed', error, { sessionId });
            await this.sessionRepo.updateStatus(sessionId, 'active');
            throw error; // Re-throw so the caller (route) sees it if awaiting, or background logger catches it
        }
    }

    async handleChatInteraction(sessionId: string, userMessage: string) {
        // 1. Load History
        const session = await this.sessionRepo.getHistory(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);

        // 2. Format Context
        const vehicleContext = `
      VEHICLE: ${vehicle?.specs.year} ${vehicle?.specs.make} ${vehicle?.specs.model}
      LAST DIAGNOSIS: ${JSON.stringify(session.aiAnalysis)}
    `;

        // 3. Get Answer
        const reply = await this.chatAI.generateReply(
            session.messages,
            userMessage,
            vehicleContext,
            session.aiAnalysis
        );

        // 4. Save Interaction
        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        return reply;
    }

    async processVoiceCommand(sessionId: string, audioData: Float32Array): Promise<string> {
        try {
            // 1. Load Session & Vehicle
            const session = await this.sessionRepo.findById(sessionId);
            if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");

            const vehicle = await this.vehicleRepo.findById(session.vehicleId);
            const vehicleContext = `${vehicle?.specs.year} ${vehicle?.specs.make} ${vehicle?.specs.model}`;

            // 2. Process Audio via Gemini 3 Pro (Voice Adapter)
            const reply = await this.chatAI.processAudioCommand(audioData, vehicleContext);

            // 3. Save Interaction
            // Note: Audio is processed natively by the multimodal AI. We log a placeholder since the transcript is handled internally.
            await this.sessionRepo.addMessage(sessionId, 'user', '🎤 [Voice Command]');
            await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

            return reply;
        } catch (error) {
            this.logger.error("Failed to process voice command", error, { sessionId });
            return "I'm having trouble with the voice connection right now. Please try again or type your message.";
        }
    }

    async startSession(vehicleId: string): Promise<string> {
        const vehicle = await this.vehicleRepo.findById(vehicleId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");

        const newSession: DiagnosticSession = {
            id: uuidv4(),
            vehicleId: vehicle.id,
            userId: vehicle.userId,
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false // Initialize safety stop status
        };

        await this.sessionRepo.create(newSession);
        return newSession.id;
    }

    async getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");

        return { session, vehicle };
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void> {
        await this.sessionRepo.addMessage(sessionId, role, content);
    }

    async deleteSession(sessionId: string, userId: string): Promise<void> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found', 404);
        }

        if (session.userId !== userId) {
            this.logger.warn('[DiagnosticService] deleteSession forbidden', { sessionId, userId, ownerId: session.userId });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this session', 403);
        }

        await this.sessionRepo.delete(sessionId);
        this.logger.info('[DiagnosticService] Session deleted', { sessionId, userId });
    }
}
