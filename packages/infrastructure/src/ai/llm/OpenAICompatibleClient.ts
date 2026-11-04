import type { ChatCompletionClient, ChatCompletionRequest } from './ChatCompletionClient';

export interface OpenAICompatibleClientOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    fetchImpl?: typeof fetch;
}

export class ChatCompletionError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'ChatCompletionError';
    }
}

interface CompletionResponse {
    choices?: { message?: { content?: string | null } }[];
}

interface CompletionChunk {
    choices?: { delta?: { content?: string | null } }[];
}

/** Calls any OpenAI-compatible /chat/completions endpoint with fetch. */
export class OpenAICompatibleClient implements ChatCompletionClient {
    readonly model: string;
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: OpenAICompatibleClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.apiKey = options.apiKey;
        this.model = options.model;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    async complete(request: ChatCompletionRequest): Promise<string> {
        const response = await this.post(request, false);
        const body = (await response.json()) as CompletionResponse;
        return body.choices?.[0]?.message?.content ?? '';
    }

    async *stream(request: ChatCompletionRequest): AsyncIterable<string> {
        const response = await this.post(request, true);
        if (!response.body) throw new ChatCompletionError('Streaming response had no body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const delta = parseSseLine(line);
                if (delta === null) return;
                if (delta) yield delta;
            }
        }

        const tail = parseSseLine(buffer);
        if (tail) yield tail;
    }

    private async post(request: ChatCompletionRequest, stream: boolean): Promise<Response> {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: request.messages,
                temperature: request.temperature,
                stream,
                ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            }),
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new ChatCompletionError(
                `Chat completion failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`,
                response.status,
            );
        }
        return response;
    }
}

/**
 * Parses one Server-Sent Events line.
 * Returns the text delta, '' for lines without text, or null at [DONE].
 */
export function parseSseLine(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return '';
    const data = trimmed.slice('data:'.length).trim();
    if (data === '[DONE]') return null;
    try {
        const chunk = JSON.parse(data) as CompletionChunk;
        return chunk.choices?.[0]?.delta?.content ?? '';
    } catch {
        return '';
    }
}
