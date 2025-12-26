import { AIAnalysis, MessagePart } from '../types/models';
import { ReasoningEffort } from '../types/ai';
import { VerificationRequest, VerificationResponse } from '../types/verification';
import { LocalTriageResult } from '../types/localPerception';

export interface IMultimodalUploadAnalyzer {
    analyzeUploadedVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType?: string,
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number
    ): Promise<AIAnalysis>;

    analyzeUploadedImage(
        imageUrl: string,
        vehicleContext: string,
        mimeType?: string,
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort
    ): Promise<AIAnalysis>;

    countTokens(content: string | MessagePart[]): Promise<number>;
}

export interface ISafetyAI {
    assessSafety(prompt: string): Promise<string | null>;
}
export interface ILiveStreamAnalyzer {
    analyzeLiveImageFrame(
        imageData: string,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        inputTimestamp?: number,
        localTriage?: LocalTriageResult
    ): Promise<AIAnalysis | MessagePart[] | null>;

    analyzeLiveAudioChunk(
        audioData: string,
        mimeType: string,
        vehicleContext: string,
        userId: string,
        sessionId: string,
        audioChunkDurationSeconds: number,
        inputTimestamp?: number
    ): Promise<AIAnalysis | MessagePart[] | null>;

    countTokens(content: string | MessagePart[]): Promise<number>;
}
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

    generateReplyStream(
        history: { role: string; content?: unknown }[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: { inlineData?: { mimeType: string, data: string }, fileData?: { mimeType: string, fileUri: string } }[]
    ): AsyncGenerator<string, string | MessagePart[], unknown>;

    verifyHypothesis(
        request: VerificationRequest
    ): Promise<VerificationResponse>;

    countTokens(content: string): Promise<number>;
}