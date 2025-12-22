export interface MemorySearchOptions {
    spaceId?: string;
    limit?: number;
}

export interface MemorySearchResult {
    content: string;
    metadata?: Record<string, any>;
}

export interface IMemoryService {
    addDocument(content: string, tags?: string[], spaceId?: string): Promise<void>;
    search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
}
