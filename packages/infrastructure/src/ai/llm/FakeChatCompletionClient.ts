import type { ChatCompletionClient, ChatCompletionRequest, ChatCompletionResult } from './ChatCompletionClient';

/** In-memory ChatCompletionClient for tests and offline demos: replays scripted replies. */
export class FakeChatCompletionClient implements ChatCompletionClient {
    readonly model = 'fake-model';
    readonly requests: ChatCompletionRequest[] = [];

    constructor(private readonly replies: string[]) {}

    async complete(request: ChatCompletionRequest): Promise<string> {
        this.requests.push(request);
        return this.replies.shift() ?? '';
    }

    async completeWithUsage(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
        return { content: await this.complete(request) };
    }

    async *stream(request: ChatCompletionRequest): AsyncIterable<string> {
        const reply = await this.complete(request);
        for (const word of reply.split(/(?<= )/)) yield word;
    }
}
