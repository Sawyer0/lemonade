// functions/livekit-agent/src/types.ts
import { Part } from '@google-cloud/vertexai';

export interface AIAnalysis {
    safety_alert: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    diagnosis: string;
    visual_evidence: string[];
    acoustic_evidence: string[];
    suggested_actions: string[];
    engineDescription: string;
    isStock: boolean;
    visualConflictDetected: boolean;
    detectedCondition: 'clean' | 'rust' | 'leak' | 'broken' | 'modified' | 'unknown';
    confidence: number;
    verification?: {
        isVerified: boolean;
        verifiedSource?: string | null;
        conflictingEvidence?: string | null;
    };
    referToHuman?: boolean;
}

export interface MessagePart {
    type: 'text' | 'image' | 'audio' | 'tool-call' | 'tool-response';
    text?: string;
    image?: string; // base64 or URL
    audio?: string; // base64 or URL
    toolName?: string;
    toolCallId?: string;
    args?: Record<string, any>;
    response?: Record<string, any>;
}

export interface ILiveStreamAnalyzer {
    analyzeLiveImageFrame(
        imageData: string, // Base64 encoded image data
        mimeType: string, // e.g., 'image/jpeg', 'image/png'
        vehicleContext: string,
        userId: string,
        sessionId: string,
        inputTimestamp?: number // Optional: timestamp of the frame from client for auditing/tracking
    ): Promise<AIAnalysis | null>;

    analyzeLiveAudioChunk(
        audioData: string, // Base64 encoded audio data
        mimeType: string, // e.g., 'audio/webm', 'audio/wav'
        vehicleContext: string,
        userId: string,
        sessionId: string,
        audioChunkDurationSeconds: number,
        inputTimestamp?: number
    ): Promise<AIAnalysis | null>;

    countTokens(content: string | MessagePart[] | Part[]): Promise<number>;
}

export interface JobMetadata {
    vehicleContext?: string;
    userId?: string;
    // Add any other relevant metadata from the client here
}

export type ReasoningEffort = "none" | "low" | "moderate" | "high";

// Interface for the Fast Chatter (Gemini Flash) - adapted from IAIService
export interface IChatAssistantAI {
    generateReply(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: { inlineData?: { mimeType: string, data: string }, fileData?: { mimeType: string, fileUri: string } }[] // New: for multimodal chat
    ): Promise<string | MessagePart[]>;

    // Note: verifyHypothesis is not strictly needed by the LiveKit agent in its current role
    // but included for completeness of the IChatAssistantAI interface
    verifyHypothesis?(
        request: VerificationRequest
    ): Promise<VerificationResponse>;

    countTokens?(content: string | MessagePart[] | Part[]): Promise<number>;
}

// Dummy for VerificationRequest, VerificationResponse if not imported from main app
// If these are needed, they would also need to be defined or imported
interface VerificationRequest {}
interface VerificationResponse {}