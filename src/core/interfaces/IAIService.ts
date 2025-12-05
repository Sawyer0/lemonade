import { AIAnalysis } from '../types/models';

// Interface 1: The Heavy Lifter (Gemini 3 Pro)
export interface IVideoDiagnosticAI {
    analyzeMechanicalVideo(videoUrl: string, vehicleContext: string): Promise<AIAnalysis>;
}

// Interface 2: The Fast Chatter (Gemini Flash)
export interface IChatAssistantAI {
    generateReply(
        history: { role: string; content: string }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null
    ): Promise<string>;

    processAudioCommand(
        audioData: Float32Array,
        vehicleContext: string
    ): Promise<string>;
}
