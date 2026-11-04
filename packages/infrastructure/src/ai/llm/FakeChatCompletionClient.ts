import type { ChatCompletionClient, ChatCompletionRequest, ChatCompletionResult } from './ChatCompletionClient';

/** Builds a reply for a request once the scripted replies run out. */
export type FakeReplyFactory = (request: ChatCompletionRequest) => string;

/**
 * In-memory ChatCompletionClient for tests and offline demos: replays scripted
 * replies in order, then answers from the optional factory (or with '').
 */
export class FakeChatCompletionClient implements ChatCompletionClient {
    readonly requests: ChatCompletionRequest[] = [];

    constructor(
        private readonly replies: string[],
        private readonly fallback?: FakeReplyFactory,
        readonly model: string = 'fake-model',
    ) {}

    async complete(request: ChatCompletionRequest): Promise<string> {
        this.requests.push(request);
        return this.replies.shift() ?? this.fallback?.(request) ?? '';
    }

    async completeWithUsage(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
        return { content: await this.complete(request) };
    }

    async *stream(request: ChatCompletionRequest): AsyncIterable<string> {
        const reply = await this.complete(request);
        for (const word of reply.split(/(?<= )/)) yield word;
    }
}
