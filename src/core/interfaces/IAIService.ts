import { AIAnalysis } from '../types/models';

// Interface 1: The Heavy Lifter (Gemini 3 Pro)
export interface IVideoDiagnosticAI {
    analyzeMechanicalVideo(videoUrl: string, vehicleContext: string): Promise<AIAnalysis>;
}

// Interface 2: The Fast Chatter (Gemini Flash)
export interface IChatAssistantAI {
    generateReply(
        history: { role: string; content: string }[],
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null
    ): Promise<string>;
}
