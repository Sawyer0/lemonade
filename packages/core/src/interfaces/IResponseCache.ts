/**
 * Short-lived cache for model answers to identical requests (same history,
 * context and settings), so retries and duplicate submissions skip the model.
 * Best effort: a miss or a failed write must never break the caller.
 */
export interface IResponseCache {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}
