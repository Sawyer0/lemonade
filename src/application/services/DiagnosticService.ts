import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type {
    IVideoDiagnosticAI,
    IChatAssistantAI
} from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';

@injectable()
export class DiagnosticService {
    constructor(
        @inject(TYPES.VideoAI) private videoAI: IVideoDiagnosticAI, // Gemini 3 Pro
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,     // Gemini Flash
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository
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
            console.error(error);
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
            vehicleContext,
            session.aiAnalysis
        );

        // 4. Save Interaction
        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        return reply;
    }
}
