/**
 * Interface for managing Vertex AI Context Caching.
 * Allows creating, retrieving, updating, and deleting cached content to optimize token usage.
 */
export interface IContextCacheService {
    /**
     * Creates a new cached content resource.
     * 
     * @param content - The content to cache (system instructions, documents, etc.).
     *                  For direct caching, content limits apply (e.g., up to 10MB or token limits).
     * @param ttlSeconds - Time-to-live for the cache in seconds.
     *                     Minimum value is 60 seconds. Default is usually 60 minutes (3600s).
     * @returns The resource name of the created cache (e.g., "projects/.../cachedContents/...").
     */
    createCache(content: string, ttlSeconds?: number): Promise<string>;

    /**
     * Retrieves metadata for an existing cache.
     * 
     * @param cacheName - The resource name of the cache.
     * @returns The cache metadata object (structure depends on SDK response).
     */
    getCache(cacheName: string): Promise<unknown>;

    /**
     * Updates an existing cache, primarily to extend its TTL.
     * 
     * @param cacheName - The resource name of the cache to update.
     * @param ttlSeconds - New TTL in seconds to extend existence from now (or absolute expiration).
     *                     Minimum 60 seconds.
     * @returns void or the updated metadata.
     */
    updateCache(cacheName: string, ttlSeconds: number): Promise<void>;

    /**
     * Deletes a cached content resource.
     * 
     * @param cacheName - The resource name of the cache to delete.
     */
    deleteCache(cacheName: string): Promise<void>;

    /**
     * Lists active caches for the project/location.
     * 
     * @returns A list of cache resource names or objects.
     */
    listCaches(): Promise<unknown[]>;
}
