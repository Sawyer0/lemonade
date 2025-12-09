import { AIAnalysis, MessagePart } from '../types/models';
import { ReasoningEffort } from '../types/ai'; // Added

// Interface 1: The Heavy Lifter (Gemini 3 Pro)
export interface IVideoDiagnosticAI {
    analyzeMechanicalVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType?: string,
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<AIAnalysis>;
    analyzeManual?(
        manualUri: string,
        query: string,
        cacheName?: string,
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<string>;
}

export interface ISafetyAI {
    assessSafety(prompt: string): Promise<string | null>;
}

// Interface 2: The Fast Chatter (Gemini Flash)
export interface IChatAssistantAI {
    generateReply(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<string | MessagePart[]>;

    processVoiceCommand(
        audioData: Float32Array | Buffer,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<string>;
}
