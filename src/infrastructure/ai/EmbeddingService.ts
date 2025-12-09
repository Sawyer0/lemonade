import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IEmbeddingService } from '@/core/interfaces/IEmbeddingService';
import { TYPES } from '@/infrastructure/di/types';
import type { ILogger } from '@/core/interfaces/ILogger';
import { CONFIG } from '@/infrastructure/config';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class EmbeddingService implements IEmbeddingService {
    private model: GenerativeModel;
    // Hardcoded for Collective Memory as agreed in plan
    private readonly MODEL_NAME = 'text-embedding-004';

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

            this.model = vertex.getGenerativeModel({ model: this.MODEL_NAME });
        } catch (error) {
            this.logger.error('Failed to initialize EmbeddingService', error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to initialize AI Embedding Service');
        }
    }

    async embed(text: string): Promise<number[]> {
        try {
            // @ts-ignore - SDK types might be missing embedContent for GenerativeModel in this version
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
        // Vertex AI supports batch embedding but for MVP implementation we loop to be safe with limits
        // Ideally use batchEmbedContents if available in SDK version
        try {
            // Parallel execution with Promise.all
            return await Promise.all(texts.map(t => this.embed(t)));
        } catch (error) {
            this.logger.error('[EmbeddingService] Batch implementation failed', error);
            throw error;
        }
    }
}
