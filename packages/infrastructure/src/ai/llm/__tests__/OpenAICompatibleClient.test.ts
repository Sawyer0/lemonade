import { describe, expect, it, vi } from 'vitest';
import { ChatCompletionError, OpenAICompatibleClient, parseSseLine } from '../OpenAICompatibleClient';
import { GROQ_BASE_URL, GROQ_DEFAULT_MODEL, MissingApiKeyError, createGroqClient, resolveLlmProvider } from '../groq';

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
        },
    });
}

describe('OpenAICompatibleClient', () => {
    it('posts an OpenAI-style request and returns the message content', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 }),
            );
        const client = new OpenAICompatibleClient({
            baseUrl: 'https://llm.test/v1/',
            apiKey: 'k',
            model: 'm',
            fetchImpl,
        });

        await expect(client.complete({ messages: [{ role: 'user', content: 'hi' }], jsonMode: true })).resolves.toBe(
            'hello',
        );

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://llm.test/v1/chat/completions');
        expect(init.headers.Authorization).toBe('Bearer k');
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({ model: 'm', stream: false, response_format: { type: 'json_object' } });
    });

    it('streams deltas across chunk boundaries and stops at [DONE]', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(
                new Response(
                    sseBody([
                        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
                        'data: {"choices":[{"delta":{"con',
                        'tent":"lo"}}]}\n\n',
                        'data: [DONE]\n',
                        'data: {"choices":[{"delta":{"content":"ignored"}}]}\n',
                    ]),
                    { status: 200 },
                ),
            );
        const client = new OpenAICompatibleClient({
            baseUrl: 'https://llm.test/v1',
            apiKey: 'k',
            model: 'm',
            fetchImpl,
        });

        const parts: string[] = [];
        for await (const delta of client.stream({ messages: [{ role: 'user', content: 'hi' }] })) parts.push(delta);
        expect(parts.join('')).toBe('Hello');
    });

    it('raises ChatCompletionError with the HTTP status on failure', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('invalid key', { status: 401 }));
        const client = new OpenAICompatibleClient({
            baseUrl: 'https://llm.test/v1',
            apiKey: 'bad',
            model: 'm',
            fetchImpl,
        });

        await expect(client.complete({ messages: [] })).rejects.toMatchObject({
            name: 'ChatCompletionError',
            status: 401,
        });
        await expect(client.complete({ messages: [] })).rejects.toBeInstanceOf(ChatCompletionError);
    });

    it('parses SSE lines', () => {
        expect(parseSseLine('data: [DONE]')).toBeNull();
        expect(parseSseLine(': keep-alive')).toBe('');
        expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toBe('');
        expect(parseSseLine('data: {"choices":[{"delta":{"content":"x"}}]}')).toBe('x');
    });
});

describe('createGroqClient', () => {
    it('fails with a clear message when GROQ_API_KEY is missing', () => {
        expect(() => createGroqClient({})).toThrow(MissingApiKeyError);
        expect(() => createGroqClient({ GROQ_API_KEY: '  ' })).toThrow(/GROQ_API_KEY is not set/);
    });

    it('uses the Groq endpoint and default model, with env overrides', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
            );
        const client = createGroqClient({ GROQ_API_KEY: 'gsk_test' }, fetchImpl);
        expect(client.model).toBe(GROQ_DEFAULT_MODEL);
        await client.complete({ messages: [] });
        expect(fetchImpl.mock.calls[0][0]).toBe(`${GROQ_BASE_URL}/chat/completions`);

        expect(createGroqClient({ GROQ_API_KEY: 'k', GROQ_MODEL: 'llama-3.3-70b-versatile' }).model).toBe(
            'llama-3.3-70b-versatile',
        );
    });
});

describe('resolveLlmProvider', () => {
    it('defaults to vertex and accepts groq', () => {
        expect(resolveLlmProvider({})).toBe('vertex');
        expect(resolveLlmProvider({ LLM_PROVIDER: 'GROQ' })).toBe('groq');
    });

    it('rejects unknown providers', () => {
        expect(() => resolveLlmProvider({ LLM_PROVIDER: 'openai' })).toThrow(/Unsupported LLM_PROVIDER/);
    });
});
