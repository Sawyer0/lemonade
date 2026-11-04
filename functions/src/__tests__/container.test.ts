import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('functions container', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('resolves the video service with the offline provider and no credentials', async () => {
        vi.stubEnv('LLM_PROVIDER', 'offline');
        vi.stubEnv('GCLOUD_PROJECT', 'demo-lemonade');
        const { createContainer } = await import('../infrastructure/di/container');
        const { TYPES } = await import('../infrastructure/di/types');
        const { VideoAnalysisService } = await import('../application/services/VideoAnalysisService');

        const container = createContainer();

        expect(container.get(TYPES.VideoService)).toBeInstanceOf(VideoAnalysisService);
        const analyzer = container.get<{ analyzeUploadedVideo: unknown }>(TYPES.VideoAI);
        expect(typeof analyzer.analyzeUploadedVideo).toBe('function');
    });
});
