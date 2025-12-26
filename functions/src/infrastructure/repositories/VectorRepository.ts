import { injectable } from 'inversify';
import { IVectorRepository, VectorDocument, SimilarCase, VectorDocumentSchema, EmbedContentResponse } from '@lemonade/core';
import { getFirestore, FieldValue, Filter } from 'firebase-admin/firestore';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { CONFIG } from '../../config';

/**
 * Extension of GenerativeModel to include embedding methods 
 * that are missing from the @google-cloud/vertexai types.
 */
interface EmbeddingModel extends GenerativeModel {
    embedContent(request: string | object): Promise<EmbedContentResponse>;
}

interface FirestoreTimestamp {
    toDate(): Date;
}

@injectable()
export class VectorRepository implements IVectorRepository {
    private readonly COLLECTION = 'knowledge_base';
    private vertexAI: VertexAI;
    private model: EmbeddingModel;

    constructor() {
        this.vertexAI = new VertexAI({
            project: CONFIG.GCLOUD.PROJECT_ID,
            location: CONFIG.LOCATION,
        });
        this.model = this.vertexAI.getGenerativeModel({ model: CONFIG.AI_MODELS.EMBEDDING }) as unknown as EmbeddingModel;
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

    async addCase(text: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
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

    async search(query: string, limit: number = 3, filter?: Record<string, unknown>): Promise<VectorDocument[]> {
        try {
            const vector = await this.embedQuery(query);
            const coll = getFirestore().collection(this.COLLECTION);

            let preFilter;
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
                const createdAt = data.createdAt && typeof (data.createdAt as Record<string, unknown>).toDate === 'function'
                    ? (data.createdAt as FirestoreTimestamp).toDate()
                    : new Date(data.createdAt as string | number);

                const docData = {
                    ...data,
                    id: doc.id, // Add id from doc
                    createdAt,
                    vector: data.embedding?.values,
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
