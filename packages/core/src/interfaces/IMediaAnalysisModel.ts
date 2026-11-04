import type { MessagePart } from '../types/models';
import type { ReasoningEffort } from '../types/ai';

export type MediaKind = 'image' | 'video' | 'audio';

/** One piece of media, inline as base64 or by reference (https or gs:// URI). */
export interface MediaInput {
    kind: MediaKind;
    mimeType: string;
    data?: string;
    uri?: string;
}

/** Who a model-requested tool runs for; present only when the caller allows tools. */
export interface MediaToolContext {
    userId: string;
    sessionId: string;
    vin?: string;
}

export interface MediaAnalysisRequest {
    prompt: string;
    media: MediaInput;
    /** Ask for a JSON object matching AIAnalysisSchema. */
    structured: boolean;
    reasoningEffort?: ReasoningEffort;
    /** Favor latency over depth (live frames and audio). */
    realtime?: boolean;
    tools?: MediaToolContext;
}

export interface MediaToolCall {
    name: string;
    args: Record<string, unknown>;
}

export interface MediaAnalysisResult {
    /** The reply text; JSON when the request was structured. Null when the model only called tools. */
    text: string | null;
    /** Tool calls the model wants the client to run. */
    toolCalls: MediaToolCall[];
    usage?: { inputTokens: number; outputTokens: number };
    /** The model that produced the result, for billing. */
    model: string;
}

/**
 * Provider-neutral multimodal model: takes a prompt plus one image, video or
 * audio clip and returns the reply. Upload and live analysis depend on this
 * port, so Vertex Gemini or an OpenAI-compatible vision model can sit behind it.
 */
export interface IMediaAnalysisModel {
    readonly modelId: string;
    supports(kind: MediaKind): boolean;
    analyze(request: MediaAnalysisRequest): Promise<MediaAnalysisResult>;
    countTokens(content: string | MessagePart[]): Promise<number>;
}
