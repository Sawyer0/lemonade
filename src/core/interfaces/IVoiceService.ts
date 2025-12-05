/**
 * Service for processing voice commands within a diagnostic session.
 * Handles audio input and generates AI responses.
 */
export interface IVoiceService {
    processVoiceCommand(sessionId: string, audioData: Float32Array): Promise<string>;
}
