import { VectorDocument } from "../types/models";

export interface SimilarCase {
    id: string;
    text: string;
    score: number; 
    metadata: Record<string, unknown>;
}

/**
 * Node 2 Storage: Manages the "Collective Memory" vector database.
 */
export interface IVectorRepository {
    addCase(text: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>;
    findSimilar(vector: number[], limit?: number, filter?: { userId?: string }): Promise<SimilarCase[]>;
    search(query: string, limit?: number, filter?: Record<string, unknown>): Promise<VectorDocument[]>;
}
