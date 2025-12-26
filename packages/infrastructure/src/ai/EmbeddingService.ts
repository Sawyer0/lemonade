import { injectable, inject } from 'inversify';
import { GenerativeModel } from '@google-cloud/vertexai';
import type { ILogger } from '@lemonade/core';
import { 
    IEmbeddingService, 
    AppError, 
    ErrorCode, 
    SHARED_CONFIG,
    EmbedContentResponse,
    BatchEmbedContentsResponse
} from '@lemonade/core';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from './GeminiCoreAdapter';

/**
 * Extension of GenerativeModel to include embedding methods 
 * that are missing from the @google-cloud/vertexai types.
 */
interface EmbeddingModel extends GenerativeModel {
    embedContent(request: string | object): Promise<EmbedContentResponse>;
    batchEmbedContents(request: { requests: object[] }): Promise<BatchEmbedContentsResponse>;
}

@injectable()
export class EmbeddingService implements IEmbeddingService {
    private model: EmbeddingModel;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter
    ) {
        this.model = this.coreAdapter.getGenerativeModel(SHARED_CONFIG.AI_MODELS.EMBEDDING) as unknown as EmbeddingModel;
    }

    async embed(text: string): Promise<number[]> {
        try {
            const result = await this.model.embedContent(text);
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

            const response = await this.model.batchEmbedContents({
                requests: texts.map(t => ({
                    content: { role: 'user', parts: [{ text: t }] },
                    taskType: 'RETRIEVAL_DOCUMENT'
                }))
            });

            if (!response.embeddings) {
                throw new Error("No embeddings returned from batch request");
            }

            return response.embeddings.map((e, index: number) => {
                if (!e.values) throw new Error(`Embedding missing for item ${index}`);
                return e.values;
            });
        } catch (error) {
            this.logger.error('[EmbeddingService] Batch intent failed', error);
            throw error;
        }
    }
}
