import { describe, it, expect } from 'vitest';
import { CompletionMediaModel } from '../CompletionMediaModel';
import { FakeChatCompletionClient } from '../FakeChatCompletionClient';

describe('CompletionMediaModel', () => {
    it('supports images only', () => {
        const model = new CompletionMediaModel(new FakeChatCompletionClient([]));
        expect(model.supports('image')).toBe(true);
        expect(model.supports('video')).toBe(false);
        expect(model.supports('audio')).toBe(false);
        expect(model.modelId).toBe('fake-model');
    });

    it('sends an inline image as a data url in json mode', async () => {
        const client = new FakeChatCompletionClient(['{"diagnosis":"x"}']);
        const model = new CompletionMediaModel(client);

        const result = await model.analyze({
            prompt: 'diagnose',
            media: { kind: 'image', mimeType: 'image/png', data: 'AAAA' },
            structured: true,
        });

        const request = client.requests[0];
        expect(request.jsonMode).toBe(true);
        expect(request.messages[0].content).toEqual([
            { type: 'text', text: expect.stringContaining('Reply with one JSON object only') },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ]);
        expect(result).toEqual({ text: '{"diagnosis":"x"}', toolCalls: [], usage: undefined, model: 'fake-model' });
    });

    it('passes https images through and rejects gs:// references', async () => {
        const client = new FakeChatCompletionClient(['ok']);
        const model = new CompletionMediaModel(client);
        await model.analyze({
            prompt: 'p',
            media: { kind: 'image', mimeType: 'image/jpeg', uri: 'https://x/i.jpg' },
            structured: false,
        });
        expect(client.requests[0].jsonMode).toBe(false);

        await expect(
            model.analyze({
                prompt: 'p',
                media: { kind: 'image', mimeType: 'image/jpeg', uri: 'gs://b/i.jpg' },
                structured: false,
            }),
        ).rejects.toThrow('needs an https or inline image');
    });

    it('rejects video and audio', async () => {
        const model = new CompletionMediaModel(new FakeChatCompletionClient([]));
        await expect(
            model.analyze({
                prompt: 'p',
                media: { kind: 'audio', mimeType: 'audio/wav', data: 'x' },
                structured: true,
            }),
        ).rejects.toThrow('cannot analyze audio');
    });

    it('estimates tokens for text and images', async () => {
        const model = new CompletionMediaModel(new FakeChatCompletionClient([]));
        await expect(model.countTokens('abcdefgh')).resolves.toBe(2);
        await expect(
            model.countTokens([
                { type: 'text', text: 'abcd' },
                { type: 'image', image: 'https://x/i.jpg' },
            ]),
        ).resolves.toBe(1 + 2048);
    });
});
