import { describe, it, expect } from 'vitest';
import { VideoPrompts } from '../VideoPrompts';

describe('VideoPrompts', () => {
    const vehicleContext = '2021 Honda Civic';

    describe('analysis', () => {
        it('should generate an analysis prompt with vehicle context', () => {
            const prompt = VideoPrompts.analysis(vehicleContext);
            expect(prompt).toContain(vehicleContext);
            expect(prompt).toContain('STRICT VISUAL ONLY RULE');
            expect(prompt).toContain('Output JSON matching this schema');
        });
    });

    describe('liveImageAnalysis', () => {
        it('should generate a live image analysis prompt', () => {
            const prompt = VideoPrompts.liveImageAnalysis(vehicleContext);
            expect(prompt).toContain(vehicleContext);
            expect(prompt).toContain('LIVE video frame');
        });
    });

    describe('liveAudioAnalysis', () => {
        it('should generate a live audio analysis prompt', () => {
            const prompt = VideoPrompts.liveAudioAnalysis(vehicleContext);
            expect(prompt).toContain(vehicleContext);
            expect(prompt).toContain('LIVE audio chunk');
        });
    });

    describe('imageAnalysis', () => {
        it('should generate an image analysis prompt', () => {
            const prompt = VideoPrompts.imageAnalysis(vehicleContext);
            expect(prompt).toContain(vehicleContext);
            expect(prompt).toContain('static image');
        });
    });
});
