import { ReasoningEffort } from "../types/ai";

/**
 * Service for processing voice commands within a diagnostic session.
 * Handles audio input and generates AI responses.
 */
export interface IVoiceService {
    processVoiceCommand(
        audioData: Float32Array | Buffer,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<string>;
}