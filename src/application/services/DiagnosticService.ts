import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import { TYPES } from '@/infrastructure/di/types';
import type {
    IVideoDiagnosticAI,
    IChatAssistantAI
} from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import type { IDiagnosticService } from '@/core/interfaces/IDiagnosticService';
import type { ILogger } from '@/core/interfaces/ILogger';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { Vehicle } from '@/core/entities/Vehicle';

@injectable()
export class DiagnosticService implements IDiagnosticService {
    constructor(
        @inject(TYPES.VideoAI) private videoAI: IVideoDiagnosticAI, // Gemini 3 Pro
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,     // Gemini Flash
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async processVideoUpload(sessionId: string, videoUrl: string) {
        // 1. Retrieve Context
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new Error("Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);
        if (!vehicle) throw new Error("Vehicle not found");

        const context = `${vehicle.specs.year} ${vehicle.specs.make} ${vehicle.specs.model} ${vehicle.specs.engine}`;

        // 2. Update Status
        await this.sessionRepo.updateStatus(sessionId, 'analyzing');
        await this.sessionRepo.updateVideo(sessionId, videoUrl);
        this.logger.info('Video upload processed', { sessionId, videoUrl });

        try {
            // 3. Call Gemini 3 Pro
            const analysis = await this.videoAI.analyzeMechanicalVideo(videoUrl, context);

            // 4. Safety Enforcer
            if (analysis.safety_alert) {
                await this.sessionRepo.flagSafetyStop(sessionId, "Safety Alert Triggered by AI Analysis");
            }

            // 5. Save Results
            await this.sessionRepo.updateAnalysis(sessionId, analysis);

        } catch (error) {
            this.logger.error('Video processing failed', error, { sessionId });
            await this.sessionRepo.updateStatus(sessionId, 'active');
        }
    }

    async handleChatInteraction(sessionId: string, userMessage: string) {
        // 1. Load History
        const session = await this.sessionRepo.getHistory(sessionId);
        if (!session) throw new Error("Session not found");

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
        // 1. Load Session & Vehicle
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new Error("Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);
        const vehicleContext = `${vehicle?.specs.year} ${vehicle?.specs.make} ${vehicle?.specs.model}`;

        // 2. Process Audio via Gemini Flash
        const reply = await this.chatAI.processAudioCommand(audioData, vehicleContext);

        // 3. Save Interaction
        // We log a generic "Voice Command" for the user side since we don't have STT here.
        await this.sessionRepo.addMessage(sessionId, 'user', '🎤 [Voice Command]');
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        return reply;
    }
    async startSession(vehicleId: string): Promise<string> {
        const vehicle = await this.vehicleRepo.findById(vehicleId);
        if (!vehicle) throw new Error("Vehicle not found");

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
            aiAnalysis: null
        };

        await this.sessionRepo.create(newSession);
        return newSession.id;
    }
    async getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new Error("Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);
        if (!vehicle) throw new Error("Vehicle not found");

        return { session, vehicle };
    }
    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
        await this.sessionRepo.addMessage(sessionId, role, content);
    }
}
