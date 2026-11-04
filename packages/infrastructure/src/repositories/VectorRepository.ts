import {
    IVectorRepository,
    VectorDocument,
    SimilarCase,
    VectorDocumentSchema,
    ILogger,
    SHARED_CONFIG,
    EmbedContentResponse,
} from '@lemonade/core';
import { injectable, inject } from 'inversify';
import { getFirestore, FieldValue, Filter, Timestamp } from 'firebase-admin/firestore';
import { GenerativeModel } from '@google-cloud/vertexai';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';

interface EmbeddingModel extends GenerativeModel {
    embedContent(request: string | object): Promise<EmbedContentResponse>;
}

@injectable()
export class VectorRepository implements IVectorRepository {
    private readonly COLLECTION = 'knowledge_base';
    private model: EmbeddingModel;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
    ) {
        this.model = this.coreAdapter.getGenerativeModel(
            SHARED_CONFIG.AI_MODELS.EMBEDDING,
        ) as unknown as EmbeddingModel;
    }

    private async embedQuery(text: string): Promise<number[]> {
        try {
            const result = await this.model.embedContent(text);
            const values = result.embedding?.values;
            if (!values) throw new Error('No embedding returned');
            return values;
        } catch (error) {
            this.logger.error('[VectorRepository] Embedding generation failed', error);
            throw error;
        }
    }

    async addCase(text: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
        const db = getFirestore();
        const docRef = db.collection(this.COLLECTION).doc();
        await docRef.set({
            text,
            embedding: FieldValue.vector(vector),
            metadata: metadata || {},
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    async findSimilar(vector: number[], limit: number = 3, filter?: { userId?: string }): Promise<SimilarCase[]> {
        const db = getFirestore();
        const coll = db.collection(this.COLLECTION);

        let preFilter;
        if (filter?.userId) {
            preFilter = Filter.where(`metadata.userId`, '==', filter.userId);
        }

        const vectorQuery = coll.findNearest({
            vectorField: 'embedding',
            queryVector: FieldValue.vector(vector),
            limit: limit,
            distanceMeasure: 'COSINE',
            distanceResultField: '_distance',
            ...(preFilter ? { filter: preFilter } : {}),
        });

        const snapshot = await vectorQuery.get();

        return snapshot.docs.map((doc) => {
            const data = doc.data();
            const distance = (data._distance as number) || 0;
            return {
                id: doc.id,
                text: data.text,
                score: 1.0 - distance,
                metadata: data.metadata || {},
            };
        });
    }

    async search(query: string, limit: number = 3, filter?: Record<string, unknown>): Promise<VectorDocument[]> {
        try {
            const vector = await this.embedQuery(query);
            const db = getFirestore();
            const coll = db.collection(this.COLLECTION);

            let preFilter;
            if (filter && Object.keys(filter).length > 0) {
                const filters = Object.entries(filter).map(([key, value]) =>
                    Filter.where(`metadata.${key}`, '==', value),
                );
                preFilter = filters.length > 1 ? Filter.and(...filters) : filters[0];
            }

            const vectorQuery = coll.findNearest({
                vectorField: 'embedding',
                queryVector: FieldValue.vector(vector),
                limit: limit,
                distanceMeasure: 'COSINE',
                distanceResultField: '_distance',
                ...(preFilter ? { filter: preFilter } : {}),
            });

            const snapshot = await vectorQuery.get();

            return snapshot.docs
                .map((doc) => {
                    const data = doc.data();
                    const createdAt =
                        data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt);

                    const docData = {
                        ...data,
                        id: doc.id,
                        createdAt,
                        vector: data.embedding?.values || [],
                    };

                    const result = VectorDocumentSchema.safeParse(docData);
                    if (!result.success) {
                        this.logger.error(`VectorDocument data validation failed for doc ${doc.id}`, result.error);
                        return null;
                    }
                    return result.data;
                })
                .filter((doc): doc is VectorDocument => doc !== null);
        } catch (error) {
            this.logger.error('[VectorRepository] Search failed', error);
            return [];
        }
    }
}
