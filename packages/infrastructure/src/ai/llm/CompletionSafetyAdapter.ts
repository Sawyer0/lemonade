import type { ISafetyAI } from '@lemonade/core';
import type { ChatCompletionClient } from './ChatCompletionClient';

/** System 1 semantic safety check backed by a ChatCompletionClient, returning raw JSON text. */
export class CompletionSafetyAdapter implements ISafetyAI {
    constructor(private readonly client: ChatCompletionClient) {}

    async assessSafety(prompt: string): Promise<string | null> {
        const text = await this.client.complete({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            jsonMode: true,
        });
        return text.trim() || null;
    }
}
