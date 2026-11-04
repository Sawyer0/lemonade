import { injectable, inject } from 'inversify';
import { GoogleGenAI } from '@google/genai';
import type { ILogger } from '@lemonade/core';
import { IEmbeddingService, AppError, ErrorCode, SHARED_CONFIG } from '@lemonade/core';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { TYPES } from '../di/types';

/** Embedding dimension stored in Firestore vector indexes (text-embedding-004 default). */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Text embeddings on Vertex AI through the Gen AI SDK. The Vertex `GenerativeModel`
 * this used to call has no embed methods, so every call failed at runtime.
 * Credentials: an explicit service account key when set, otherwise Application
 * Default Credentials.
 */
@injectable()
export class EmbeddingService implements IEmbeddingService {
    private readonly client: GoogleGenAI;
    private readonly model = SHARED_CONFIG.AI_MODELS.EMBEDDING;

    constructor(
        @inject(TYPES.Logger) private readonly logger: ILogger,
        @inject(TYPES.ConfigProvider) config: IConfigProvider,
    ) {
        const { projectId, location } = config.getGoogleCloudConfig();
        const key = config.getFirebaseConfig().serviceAccountKey;
        this.client = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: location || 'us-central1',
            googleAuthOptions: key ? { credentials: JSON.parse(key) } : undefined,
        });
    }

    async embed(text: string): Promise<number[]> {
        const [vector] = await this.request([text], 'RETRIEVAL_QUERY', 'Failed to generate embedding');
        return vector;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];
        return this.request(texts, 'RETRIEVAL_DOCUMENT', 'Failed to generate embeddings');
    }

    private async request(texts: string[], taskType: string, failure: string): Promise<number[][]> {
        try {
            const response = await this.client.models.embedContent({
                model: this.model,
                contents: texts,
                config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
            });
            const vectors = (response.embeddings ?? []).map((e) => e.values ?? []);
            if (vectors.length !== texts.length || vectors.some((v) => v.length === 0)) {
                throw new Error(`Expected ${texts.length} embeddings, got ${vectors.length}`);
            }
            return vectors;
        } catch (error) {
            this.logger.error(`[EmbeddingService] ${failure}`, error as Error);
            throw new AppError(ErrorCode.AI_SERVICE_ERROR, failure);
        }
    }
}
