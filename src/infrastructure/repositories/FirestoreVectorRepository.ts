import { injectable, inject } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import { FieldValue, Filter } from 'firebase-admin/firestore';
import type { IVectorRepository, SimilarCase, IEmbeddingService, ILogger } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class FirestoreVectorRepository implements IVectorRepository {
    private readonly COLLECTION = 'collective_memory';

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.EmbeddingService) private embeddingService: IEmbeddingService
    ) { }

    async search(query: string, limit: number = 5, filter?: Record<string, unknown>): Promise<any[]> {
        try {
            const vector = await this.embeddingService.embed(query);

            // Extract userId from filter if present, as findSimilar expects { userId?: string }
            const userId = filter?.userId as string | undefined;

            return await this.findSimilar(vector, limit, { userId });

        } catch (error) {
            this.logger.error('[FirestoreVectorRepository] Semantic Search failed', error);
            // Fallback: Return empty or throw? Interface implies array return.
            return [];
        }
    }

    async addCase(text: string, vector: number[], metadata: Record<string, unknown> = {}): Promise<void> {
        try {
            await adminDb.collection(this.COLLECTION).add({
                text,
                vector: FieldValue.vector(vector), // Using Firestore's native vector type
                metadata: { isGlobal: false, ...metadata }, // Ensure field exists for querying
                createdAt: new Date()
            });
            this.logger.info('[FirestoreVectorRepository] Added case to collective memory');
        } catch (error) {
            this.logger.error('[FirestoreVectorRepository] Failed to add case', error);
            const err = error instanceof Error ? error : new Error(String(error));
            throw err;
        }
    }

    async findSimilar(vector: number[], limit: number = 5, filter?: { userId?: string }): Promise<SimilarCase[]> {
        try {
            const coll = adminDb.collection(this.COLLECTION);

            // Access Control: Search User's Fleet AND Global Knowledge Base
            let preFilter: Filter | undefined;
            if (filter?.userId) {
                preFilter = Filter.or(
                    Filter.where('metadata.userId', '==', filter.userId),
                    Filter.where('metadata.isGlobal', '==', true)
                );
            } else {
                // If no user context, search only global
                preFilter = Filter.where('metadata.isGlobal', '==', true);
            }

            // Perform Vector Search using Native Firestore capabilities (SDK v12+)
            const vectorQuery = coll.findNearest({
                vectorField: 'vector',
                queryVector: FieldValue.vector(vector),
                limit: limit,
                distanceMeasure: 'COSINE',
                distanceResultField: '_distance',
                ...(preFilter ? { filter: preFilter } : {})
            });

            const snapshot = await vectorQuery.get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                // COSINE distance is (1 - cosine_similarity) for normalized vectors.
                // We convert back to similarity score (0 to 1).
                // Ensure typed access if possible, or safe access.
                const distance = (data._distance as number) || 0;

                return {
                    id: doc.id,
                    text: data.text,
                    score: 1.0 - distance, // Real calculated score
                    metadata: data.metadata
                };
            });
        } catch (error) {
            this.logger.error('[FirestoreVectorRepository] Vector search failed', error);
            return [];
        }
    }
}
