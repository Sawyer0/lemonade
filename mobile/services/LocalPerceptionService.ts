import { CONFIG } from '../constants/config';
import { initLlama, LlamaContext } from 'llama.rn';
import { ILogger, ILocalPerceptionService, SemanticTriageResult, SemanticTriageResultSchema } from '@lemonade/core';
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
                n_ctx: CONFIG.LOCAL_INFERENCE.CONTEXT_SIZE,
                n_gpu_layers: CONFIG.LOCAL_INFERENCE.GPU_LAYERS,
                flash_attn: CONFIG.LOCAL_INFERENCE.USE_FLASH_ATTN,
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
            const warmupPath = `${(FileSystem as any).cacheDirectory}warmup.jpg`;
            // 1x1 Black Pixel (JPEG Base64)
            const dummyBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEGMkMAAAABABQRAP/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AP/Z';

            await FileSystem.writeAsStringAsync(warmupPath, dummyBase64, {
                encoding: (FileSystem as any).EncodingType.Base64
            });

            // Run a trivial completion to force tensor allocation
            await this.context.completion({
                prompt: "Identify.",
                media_paths: [warmupPath],
                n_predict: 1,
            });

            this.logger.info('Model Warmup Complete. NPU Tensor Graph Allocated.');
        } catch (e) {
            this.logger.warn('Model Warmup failed (non-critical)', { error: e });
        }
    }

    async triageFrame(framePath: string): Promise<SemanticTriageResult[]> {
        if (!this.ready || !this.context) {
            return [];
        }

        const metrics = this.performanceMonitor.getMetrics();
        if (metrics.shouldThrottle) {
            return [];
        }

        try {
            // Strict JSON Schema Prompt
            const prompt = `[IMAGE] Analyze the image. Return a JSON object with:
id.obj: Part name.
id.cat: System (e.g., Engine, Suspension).
eval.stat: NORMAL, CAUTION, CRITICAL, or UNCERTAIN.
eval.risk: true if dangerous.
eval.note: Brief visual reason.
Output strictly valid JSON.`;

            const result = await this.context.completion({
                prompt,
                media_paths: [framePath],
                n_predict: 64, // Increased for JSON
                stop: ["\n\n", "```"], // Stop at end of block
                temperature: 0.1,
            });

            const output = result.text.trim();
            this.logger.debug('Local Inference Result', { text: output });

            try {
                // Attempt to parse JSON
                // Clean up potential Markdown code blocks if the model adds them
                const cleanJson = output.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);

                // Validation using Zod Schema
                const validation = SemanticTriageResultSchema.safeParse({
                    ...parsed,
                    confidence: 0.85, // Placeholder until model outputs confidence
                    timestamp: Date.now(),
                    steadyStrikeCount: 1
                });

                if (validation.success) {
                    return [validation.data];
                } else {
                    this.logger.warn('Local LLM output failed validation', { errors: validation.error.format() });
                    // Fallback to UNCERTAIN if structure is invalid
                    return [{
                        id: { obj: parsed.id?.obj || 'Unknown', cat: parsed.id?.cat || 'Unknown' },
                        eval: { stat: 'UNCERTAIN', risk: false, note: 'Validation error' },
                        timestamp: Date.now(),
                        confidence: 0.0,
                    }];
                }

            } catch (jsonErr) {
                this.logger.warn('Failed to parse Local LLM JSON output', { output, error: jsonErr });

                // Fallback for non-JSON output or parsing failure
                return [{
                    id: { obj: 'Unknown', cat: 'Unknown' },
                    eval: { stat: 'UNCERTAIN', risk: false, note: 'AI parsing error' },
                    timestamp: Date.now(),
                    confidence: 0.0,
                }];
            }

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
