import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IVoiceService } from '@/core/interfaces/IVoiceService';
import type { IChatAssistantAI } from '@/core/interfaces/IAIService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import type { ILogger } from '@/core/interfaces/ILogger';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class VoiceService implements IVoiceService {
    constructor(
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async processVoiceCommand(audioData: Buffer, mimeType: string, vehicleContext: string, userId: string, sessionId: string, reasoningEffort?: any): Promise<string> { // REFACTORED
        try {
            // Note: In the original file read, I fetched context from Repo.
            // But the API route already passes 'vehicleContext'. 
            // I will respect the API Route's passed context to save a DB read.

            // 1. Process Audio via Gemini 3 Pro (Voice Adapter)
            const reply = await this.chatAI.processVoiceCommand(
                audioData,
                mimeType,
                vehicleContext,
                userId,
                sessionId,
                reasoningEffort || "none"
            );

            // 2. Save Interaction
            await this.sessionRepo.addMessage(sessionId, 'user', '🎤 [Voice Command]');
            await this.sessionRepo.addMessage(sessionId, 'assistant', reply);

            return reply;
        } catch (error) {
            this.logger.error("Failed to process voice command", error, { sessionId });
            return "I'm having trouble with the voice connection right now. Please try again or type your message.";
        }
    }
}