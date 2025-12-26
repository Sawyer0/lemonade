import { MessagePart, AIAnalysis } from '../types/models';
import { VehicleContext } from './IRealtimeAIService';

/**
 * Service for handling chat interactions within a diagnostic session.
 * Manages conversation flow and AI-assisted responses.
 */
export interface IChatService {
    handleChatInteraction(sessionId: string, userMessage: string | MessagePart[]): Promise<string | MessagePart[]>;
    handleChatInteractionStream(
        sessionId: string, 
        userMessage: string | MessagePart[],
        vehicleContextOverride?: VehicleContext,
        diagnosticContextOverride?: AIAnalysis
    ): AsyncGenerator<string, void, unknown>;
}
