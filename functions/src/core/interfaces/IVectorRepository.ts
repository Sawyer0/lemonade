export interface VectorDocument {
    id: string;
    content: string;
    metadata: Record<string, any>;
    score?: number;
}

export interface IVectorRepository {
    /**
     * Semantically searches the "Collective Memory" (Manuals, Past Cases)
     * @param query The natural language query (e.g. "2018 F-150 Torque Specs")
     * @param filter Optional metadata filter (e.g. { vehicle_model: "F-150" })
     */
    search(query: string, limit?: number, filter?: Record<string, any>): Promise<VectorDocument[]>;
}
