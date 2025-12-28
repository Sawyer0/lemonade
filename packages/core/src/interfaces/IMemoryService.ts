export interface MemoryFilter {
    field: string;
    operator: 'eq' | 'contains' | 'not_eq' | 'not_contains';
    value: string;
    ignoreCase?: boolean;
}

export interface MemorySearchOptions {
    spaceId?: string;
    limit?: number;
    includeForgotten?: boolean;
    filters?: MemoryFilter[];
    /**
     * Tags for container isolation (e.g. ['user:123', 'vin:abc'])
     */
    tags?: string[];
}

export interface MemorySearchResult {
    content: string;
    metadata?: Record<string, unknown>;
    score?: number;
}

export interface MemoryDocument {
    content?: string;
    url?: string;
    /**
     * Google Cloud Storage URI or other file reference
     */
    fileUri?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}

export interface IMemoryService {
    /**
     * Adds a document (text, URL, or file) to Supermemory.
     */
    addDocument(doc: MemoryDocument, spaceId?: string): Promise<void>;

    /**
     * Searches memories using the v4 conversational search endpoint.
     */
    search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
}
