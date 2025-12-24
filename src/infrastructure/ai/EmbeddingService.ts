import { injectable, inject } from 'inversify';
import { GenerativeModel } from '@google-cloud/vertexai';
import type { ILogger } from '@lemonade/core';
import { IEmbeddingService, AppError, ErrorCode } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { CONFIG } from '@/infrastructure/config';
import { GeminiCoreAdapter } from '@lemonade/infrastructure';

@injectable()
export class EmbeddingService implements IEmbeddingService {
    private model: GenerativeModel;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter
    ) {
        this.model = this.coreAdapter.getGenerativeModel(CONFIG.AI_MODELS.EMBEDDING);
    }

    async embed(text: string): Promise<number[]> {
        try {
            // Note: In Vertex AI SDK, embedding might need specific method or cast
            const result = await (this.model as any).embedContent(text);
            const embedding = result.embedding?.values;

            if (!embedding) {
                throw new Error("No embedding returned from model");
            }

            return embedding;
        } catch (error) {
            this.logger.error('[EmbeddingService] Failed to embed text', error);
            throw new AppError(ErrorCode.AI_SERVICE_ERROR, 'Failed to generate embedding');
        }
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        try {
            if (texts.length === 0) return [];

            const response = await (this.model as any).batchEmbedContents({
                requests: texts.map(t => ({
                    content: { role: 'user', parts: [{ text: t }] },
                    taskType: 'RETRIEVAL_DOCUMENT'
                }))
            });

            if (!response.embeddings) {
                throw new Error("No embeddings returned from batch request");
            }

            return response.embeddings.map((e: any, index: number) => {
                if (!e.values) throw new Error(`Embedding missing for item ${index}`);
                return e.values;
            });
        } catch (error) {
            this.logger.error('[EmbeddingService] Batch intent failed', error);
            throw error;
        }
    }
}
