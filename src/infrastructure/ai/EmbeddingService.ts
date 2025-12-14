import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import type { ILogger } from '@lemonade/core';
import { IEmbeddingService, AppError, ErrorCode } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { CONFIG } from '@/infrastructure/config';

// Interface to bridge missing SDK type definitions strictly
interface IVertexGenAIModel extends GenerativeModel {
    embedContent(content: string | unknown): Promise<{ embedding?: { values: number[] } }>;
    batchEmbedContents(request: { requests: unknown[] }): Promise<{ embeddings?: { values: number[] }[] }>;
}

@injectable()
export class EmbeddingService implements IEmbeddingService {
    private model: IVertexGenAIModel;

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!key) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'FIREBASE_SERVICE_ACCOUNT_KEY is missing');
        }

        try {
            const credentials = JSON.parse(key);
            const vertex = new VertexAI({
                project: CONFIG.GCLOUD.PROJECT_ID,
                location: 'us-central1',
                googleAuthOptions: { credentials }
            });

            this.model = vertex.getGenerativeModel({ model: CONFIG.AI_MODELS.EMBEDDING }) as unknown as IVertexGenAIModel;
        } catch (error) {
            this.logger.error('Failed to initialize EmbeddingService', error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to initialize AI Embedding Service');
        }
    }

    async embed(text: string): Promise<number[]> {
        try {
            // GenerativeModel.embedContent returns Promise<EmbedContentResponse>
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

            // Native Vertex AI Batch Embedding
            const response = await this.model.batchEmbedContents({
                requests: texts.map(t => ({
                    content: { role: 'user', parts: [{ text: t }] },
                    taskType: 'RETRIEVAL_DOCUMENT' // Optimal for vector search storage
                }))
            });

            if (!response.embeddings) {
                throw new Error("No embeddings returned from batch request");
            }

            // Map and validate
            return response.embeddings.map((e, index) => {
                if (!e.values) throw new Error(`Embedding missing for item ${index}`);
                return e.values;
            });
        } catch (error) {
            this.logger.error('[EmbeddingService] Batch intent failed', error);
            throw error;
        }
    }
}