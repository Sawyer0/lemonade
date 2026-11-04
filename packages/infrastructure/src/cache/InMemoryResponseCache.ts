import { createHash } from 'node:crypto';
import type { IResponseCache } from '@lemonade/core';

interface Entry {
    value: unknown;
    expiresAt: number;
}

/** Entries kept per process; the oldest is evicted first once full. */
export const RESPONSE_CACHE_MAX_ENTRIES = 500;

/**
 * Per-process response cache with expiry and a size cap. Keys are hashed, so
 * long request fingerprints cost a fixed 64 bytes each.
 */
export class InMemoryResponseCache implements IResponseCache {
    private readonly entries = new Map<string, Entry>();

    constructor(
        private readonly maxEntries: number = RESPONSE_CACHE_MAX_ENTRIES,
        private readonly now: () => number = Date.now,
    ) {}

    async get<T>(key: string): Promise<T | undefined> {
        const id = this.hash(key);
        const entry = this.entries.get(id);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(id);
            return undefined;
        }
        return structuredClone(entry.value) as T;
    }

    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        const id = this.hash(key);
        this.entries.delete(id);
        this.entries.set(id, { value: structuredClone(value), expiresAt: this.now() + ttlSeconds * 1000 });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }

    get size(): number {
        return this.entries.size;
    }

    private hash(key: string): string {
        return createHash('sha256').update(key).digest('hex');
    }
}
