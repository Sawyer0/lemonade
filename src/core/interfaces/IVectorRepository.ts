export interface VectorDocument {
    id: string;
    text: string;
    vector: number[];
    metadata: Record<string, any>;
    createdAt: Date;
}

export interface SimilarCase {
    id: string;
    text: string;
    score: number; // Similarity score (0-1)
    metadata: Record<string, any>;
}

/**
 * Node 2 Storage: Manages the "Collective Memory" vector database.
 */
export interface IVectorRepository {
    /**
     * Adds a diagnosis/case to the collective memory.
     */
    addCase(text: string, vector: number[], metadata?: Record<string, any>): Promise<void>;

    /**
     * Finds similar cases based on the query vector.
     * @param vector The user's query embedding.
     * @param limit Max number of results.
     */
    findSimilar(vector: number[], limit?: number): Promise<SimilarCase[]>;
}
