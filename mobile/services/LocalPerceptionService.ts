
import { initLlama, LlamaContext } from 'llama.rn';
import { ILogger, ILocalPerceptionService, LocalDetection } from '@lemonade/core';
import { PerformanceMonitor } from './PerformanceMonitor';
import * as FileSystem from 'expo-file-system';

export class LocalPerceptionService implements ILocalPerceptionService {
    private context: LlamaContext | null = null;
    private ready: boolean = false;

    constructor(
        private logger: ILogger,
        private performanceMonitor: PerformanceMonitor
    ) { }

    async initialize(modelPath: string): Promise<void> {
        if (this.ready) return;

        try {
            this.logger.info('Initializing Local Perception context...', { modelPath });

            this.context = await initLlama({
                model: modelPath,
                n_ctx: 1024,
                n_gpu_layers: 99,
                flash_attn: true,
            });

            this.ready = true;
            this.logger.info('Local Perception successfully anchored to hardware.');
        } catch (e) {
            this.logger.error('Failed to initialize local LLM context', e);
            this.ready = false;
            throw e;
        }
    }

    /**
     * Runs a dummy inference to prime the NPU.
     * Must be called after initialize().
     */
    async warmup(): Promise<void> {
        if (!this.ready || !this.context) return;

        try {
            this.logger.info('Starting Model Warmup (Dummy Inference)...');
            const warmupPath = `${FileSystem.cacheDirectory}warmup.jpg`;
            // 1x1 Black Pixel (JPEG Base64)
            const dummyBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEGMkMAAAABABQRAP/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AP/Z';

            await FileSystem.writeAsStringAsync(warmupPath, dummyBase64, {
                encoding: FileSystem.EncodingType.Base64
            });

            // Run a trivial completion to force tensor allocation
            await this.context.completion({
                prompt: "Identify.",
                media_paths: [warmupPath],
                n_predict: 1,
            });

            this.logger.info('Model Warmup Complete. NPU Tensor Graph Allocated.');
        } catch (e) {
            this.logger.warn('Model Warmup failed (non-critical)', e);
        }
    }

    async triageFrame(framePath: string): Promise<LocalDetection[]> {
        if (!this.ready || !this.context) {
            return [];
        }

        const metrics = this.performanceMonitor.getMetrics();
        if (metrics.shouldThrottle) {
            return [];
        }

        try {
            const prompt = "[IMAGE] Identify car part and condition concisely.";

            const result = await this.context.completion({
                prompt,
                media_paths: [framePath],
                n_predict: 24,
                stop: ["\n", "."],
                temperature: 0.1,
            });

            const output = result.text.trim().toLowerCase();
            this.logger.debug('Local Inference Result', { text: output });

            // Robust parsing: "part: state"
            const segments = output.split(':');
            const objectId = (segments[0] || 'unknown').trim();
            const state = (segments[1] || 'normal').trim();

            return [{
                objectId,
                confidence: 0.85,
                state,
                lastSeen: Date.now(),
                steadyStrikeCount: 1
            }];
        } catch (e) {
            this.logger.error('Inference pipeline failure', e);
            return [];
        }
    }

    async dispose(): Promise<void> {
        if (this.context) {
            this.logger.info('Releasing local LLM resources...');
            await this.context.release();
            this.context = null;
            this.ready = false;
        }
    }

    isReady(): boolean {
        return this.ready && this.context !== null;
    }
}
