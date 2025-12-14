export interface CachePart {
    text?: string;
    fileData?: {
        mimeType: string;
        fileUri: string;
    };
}
export interface IContextCacheService {
    /**
     * @param parts
     * @param ttlSeconds
     * @param displayName
     * @returns
     */
    createCache(parts: CachePart[], ttlSeconds?: number, displayName?: string): Promise<string>;
    /**
     * @param cacheName
     * @returns
     */
    getCache(cacheName: string): Promise<unknown>;
    /**
     * @param cacheName
     * @param ttlSeconds
     * @returns
     */
    updateCache(cacheName: string, ttlSeconds: number): Promise<void>;
    /**
     * @param cacheName
     */
    deleteCache(cacheName: string): Promise<void>;
    /**
     * @returns
     */
    listCaches(): Promise<unknown[]>;
    /**
     * @param displayName
     * @returns
     */
    findCacheByDisplayName(displayName: string): Promise<string | null>;
}
