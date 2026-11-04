/**
 * Minimal provider-neutral contract for text chat completions.
 * Adapters depend on this, so tests can swap in a fake and providers
 * (Groq today) can be changed without touching application code.
 */
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatCompletionMessage {
    role: ChatRole;
    content: string;
}

export interface ChatCompletionRequest {
    messages: ChatCompletionMessage[];
    temperature?: number;
    /** Ask the provider for a single JSON object as the reply. */
    jsonMode?: boolean;
}

export interface ChatCompletionClient {
    readonly model: string;
    complete(request: ChatCompletionRequest): Promise<string>;
    stream(request: ChatCompletionRequest): AsyncIterable<string>;
}
