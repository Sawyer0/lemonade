/**
 * Minimal provider-neutral contract for text chat completions.
 * Adapters depend on this, so tests can swap in a fake and providers
 * (Groq today) can be changed without touching application code.
 */
export type ChatRole = 'system' | 'user' | 'assistant';

/** OpenAI-style multimodal content: text, or an image by https or data: URL. */
export type ChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatCompletionMessage {
    role: ChatRole;
    content: string | ChatContentPart[];
}

export interface ChatCompletionRequest {
    messages: ChatCompletionMessage[];
    temperature?: number;
    /** Ask the provider for a single JSON object as the reply. */
    jsonMode?: boolean;
}

export interface ChatCompletionUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface ChatCompletionResult {
    content: string;
    usage?: ChatCompletionUsage;
}

export interface ChatCompletionClient {
    readonly model: string;
    complete(request: ChatCompletionRequest): Promise<string>;
    /** Like complete, plus the token usage the provider reported. */
    completeWithUsage(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
    stream(request: ChatCompletionRequest): AsyncIterable<string>;
}
