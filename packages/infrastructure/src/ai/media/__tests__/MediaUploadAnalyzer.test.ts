import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IBillingService, ILogger, IMediaAnalysisModel } from '@lemonade/core';
import { InMemoryResponseCache } from '../../../cache/InMemoryResponseCache';
import type { TracingService } from '../../../observability/TracingService';
import { MediaUploadAnalyzer } from '../MediaUploadAnalyzer';
import { CompletionMediaModel } from '../../llm/CompletionMediaModel';
import { FakeChatCompletionClient } from '../../llm/FakeChatCompletionClient';
import { FakeMediaModel, VALID_ANALYSIS } from './fakeMediaModel';

describe('MediaUploadAnalyzer', () => {
    let model: FakeMediaModel;
    let billing: IBillingService;
    let cache: InMemoryResponseCache;
    let tracer: TracingService;
    let logger: ILogger;

    const build = (m: IMediaAnalysisModel = model) => new MediaUploadAnalyzer(m, billing, cache, tracer, logger);

    beforeEach(() => {
        model = new FakeMediaModel();
        billing = { recordUsage: vi.fn().mockResolvedValue(undefined) } as unknown as IBillingService;
        cache = new InMemoryResponseCache();
        tracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as unknown as TracingService;
        logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
    });

    it('requires a user for billing', async () => {
        await expect(build().analyzeUploadedVideo('gs://b/v.mp4', 'Civic')).rejects.toThrow('User ID is required');
        await expect(build().analyzeUploadedImage('gs://b/i.jpg', 'Civic')).rejects.toThrow('User ID is required');
    });

    it('sends the video by reference as a structured request and returns the parsed analysis', async () => {
        model.reply(JSON.stringify(VALID_ANALYSIS), { usage: { inputTokens: 100, outputTokens: 20 } });

        const analysis = await build().analyzeUploadedVideo(
            'gs://b/v.mp4',
            '2020 Honda Civic',
            'video/mp4',
            'user-1',
            'session-1',
            'high',
        );

        expect(analysis.diagnosis).toBe('Worn serpentine belt');
        expect(model.requests[0]).toMatchObject({
            media: { kind: 'video', mimeType: 'video/mp4', uri: 'gs://b/v.mp4' },
            structured: true,
            reasoningEffort: 'high',
        });
        expect(model.requests[0].prompt).toContain('2020 Honda Civic');
        expect(billing.recordUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                sessionId: 'session-1',
                inputTokens: 100,
                outputTokens: 20,
                model: 'fake-media-model',
            }),
        );
        expect(cache.size).toBe(1);
    });

    it('does not bill without a session', async () => {
        model.reply(JSON.stringify(VALID_ANALYSIS), { usage: { inputTokens: 1, outputTokens: 1 } });
        await build().analyzeUploadedImage('https://x/i.jpg', 'Civic', 'image/jpeg', 'user-1');
        expect(billing.recordUsage).not.toHaveBeenCalled();
    });

    it('returns a cached analysis without calling the model', async () => {
        model.reply(JSON.stringify(VALID_ANALYSIS));
        const analyzer = build();
        await analyzer.analyzeUploadedImage('gs://b/i.jpg', 'Civic', 'image/jpeg', 'user-1', 's');
        const analysis = await analyzer.analyzeUploadedImage('gs://b/i.jpg', 'Civic', 'image/jpeg', 'user-1', 's');
        expect(analysis.diagnosis).toBe('Worn serpentine belt');
        expect(model.requests).toHaveLength(1);
    });

    it('throws on an empty reply', async () => {
        model.reply(null);
        await expect(
            build().analyzeUploadedImage('gs://b/i.jpg', 'Civic', 'image/jpeg', 'user-1', 's'),
        ).rejects.toThrow('AI returned empty response for uploaded image analysis');
    });

    it('throws on a reply that is not an analysis', async () => {
        model.reply('not valid json {');
        await expect(
            build().analyzeUploadedVideo('gs://b/v.mp4', 'Civic', 'video/mp4', 'user-1', 's'),
        ).rejects.toThrow();
    });

    it('logs and rethrows model failures', async () => {
        model.fail(new Error('503 Service Unavailable'));
        await expect(build().analyzeUploadedVideo('gs://b/v.mp4', 'Civic', 'video/mp4', 'user-1', 's')).rejects.toThrow(
            '503 Service Unavailable',
        );
        expect(logger.error).toHaveBeenCalledWith('Uploaded Video Analysis Failure', expect.any(Error));
    });

    it('surfaces a provider that cannot read video', async () => {
        const visionOnly = new CompletionMediaModel(new FakeChatCompletionClient([]));
        await expect(
            build(visionOnly).analyzeUploadedVideo('gs://b/v.mp4', 'Civic', 'video/mp4', 'user-1', 's'),
        ).rejects.toThrow('use LLM_PROVIDER=vertex for video analysis');
    });

    it('counts tokens through the model', async () => {
        await expect(build().countTokens('abcd')).resolves.toBe(4);
    });
});
