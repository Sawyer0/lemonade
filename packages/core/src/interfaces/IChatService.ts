import { MessagePart } from '../types/models';

/**
 * Service for handling chat interactions within a diagnostic session.
 * Manages conversation flow and AI-assisted responses.
 */
export interface IChatService {
    handleChatInteraction(sessionId: string, userMessage: string | MessagePart[]): Promise<string | MessagePart[]>;
    handleChatInteractionStream(sessionId: string, userMessage: string | MessagePart[]): AsyncGenerator<string, void, unknown>;
}
