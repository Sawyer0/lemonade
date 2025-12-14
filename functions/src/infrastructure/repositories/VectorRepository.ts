import { injectable } from 'inversify';
import { IVectorRepository, VectorDocument, SimilarCase, VectorDocumentSchema } from '@lemonade/core';
import { getFirestore, FieldValue, Filter } from 'firebase-admin/firestore';
import { VertexAI } from '@google-cloud/vertexai';
import { CONFIG } from '../../config';

@injectable()
export class VectorRepository implements IVectorRepository {
    private readonly COLLECTION = 'knowledge_base';
    private vertexAI: VertexAI;
    private model: { embedContent: (text: string) => Promise<{ embedding?: { values: number[] } }> };

    constructor() {
        this.vertexAI = new VertexAI({
            project: CONFIG.GCLOUD_PROJECT,
            location: CONFIG.LOCATION,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.model = this.vertexAI.getGenerativeModel({ model: CONFIG.TEXT_EMBEDDING_MODEL }) as any;
    }

    private async embedQuery(text: string): Promise<number[]> {
        try {
            const result = await this.model.embedContent(text);
            const embedding = result.embedding?.values;
            if (!embedding) throw new Error("No embedding returned");
            return embedding;
        } catch (error) {
            console.error('[VectorRepository] Embedding generation failed', error);
            throw error;
        }
    }

    async addCase(text: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
        const docRef = getFirestore().collection(this.COLLECTION).doc();
        await docRef.set({
            text,
            embedding: FieldValue.vector(vector),
            metadata: metadata || {},
            createdAt: FieldValue.serverTimestamp(),
        });
    }

    async findSimilar(vector: number[], limit: number = 3, filter?: { userId?: string }): Promise<SimilarCase[]> {
        const coll = getFirestore().collection(this.COLLECTION);

        let preFilter: any = undefined;
        if (filter?.userId) {
            preFilter = Filter.where(`metadata.userId`, '==', filter.userId);
        }

        const vectorQuery = coll.findNearest({
            vectorField: 'embedding',
            queryVector: FieldValue.vector(vector),
            limit: limit,
            distanceMeasure: 'COSINE',
            distanceResultField: '_distance',
            ...(preFilter ? { filter: preFilter } : {})
        });

        const snapshot = await vectorQuery.get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            const distance = (data._distance as number) || 0;
            return {
                id: doc.id,
                text: data.text,
                score: 1.0 - distance,
                metadata: data.metadata || {},
            } as SimilarCase; // Cast to SimilarCase
        });
    }

    async search(query: string, limit: number = 3, filter?: Record<string, unknown>): Promise<any[]> {
        try {
            const vector = await this.embedQuery(query);
            const coll = getFirestore().collection(this.COLLECTION);

            let preFilter: any = undefined;
            if (filter && Object.keys(filter).length > 0) {
                const filters = Object.entries(filter).map(([key, value]) => Filter.where(`metadata.${key}`, '==', value));
                preFilter = filters.length > 1 ? Filter.and(...filters) : filters[0];
            }

            const vectorQuery = coll.findNearest({
                vectorField: 'embedding',
                queryVector: FieldValue.vector(vector),
                limit: limit,
                distanceMeasure: 'COSINE',
                distanceResultField: '_distance',
                ...(preFilter ? { filter: preFilter } : {})
            });

            const snapshot = await vectorQuery.get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                // Convert Firestore Timestamps to Dates
                const docData = {
                    ...data,
                    id: doc.id, // Add id from doc
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
                    vector: data.embedding?.values, // Get vector from embedding values
                };

                const result = VectorDocumentSchema.safeParse(docData);
                if (!result.success) {
                    console.error(`VectorDocument data validation failed for doc ${doc.id}:`, result.error);
                    return null;
                }
                return result.data;
            }).filter((doc): doc is VectorDocument => doc !== null);



        } catch (error) {
            console.error('[VectorRepository] Search failed', error);
            return [];
        }
    }
}
