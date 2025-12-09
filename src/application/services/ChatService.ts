import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IChatService } from '@/core/interfaces/IChatService';
import type { IChatAssistantAI } from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class ChatService implements IChatService {
    constructor(
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository
    ) { }

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
            session.aiAnalysis,
            session.userId,
            sessionId,
            "low" // Added reasoningEffort as per optimization
        );

        // 4. Save Interaction
        await this.sessionRepo.addMessage(sessionId, 'user', userMessage);
        await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

        return reply;
    }
}
