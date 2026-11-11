import type { MemoryVersion } from '../types/learnedMemory';
import type { MemoryScope } from '../types/memory';

/**
 * Versioned candidate memory (LM-31). Each run writes a new candidate memory
 * version with a diff against the last. The previous version stays for
 * rollback, and the ledger is never edited.
 */

export interface VersionDiff {
    added: string[];
    removed: string[];
    changed: string[];
}

/** Shallow diff of two JSON payloads by top-level key. */
export function diffPayloads(previous: unknown, next: unknown): VersionDiff {
    if (typeof previous !== 'object' || previous === null || typeof next !== 'object' || next === null) {
        const changed = JSON.stringify(previous) === JSON.stringify(next) ? [] : ['value'];
        return { added: [], removed: [], changed };
    }
    const previousRecord = previous as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const key of Object.keys(nextRecord)) {
        if (!(key in previousRecord)) added.push(key);
        else if (JSON.stringify(previousRecord[key]) !== JSON.stringify(nextRecord[key])) changed.push(key);
    }
    for (const key of Object.keys(previousRecord)) {
        if (!(key in nextRecord)) removed.push(key);
    }
    return { added, removed, changed };
}

export function createMemoryVersion(
    previous: MemoryVersion | null,
    scope: MemoryScope,
    key: string,
    payload: unknown,
    now: string,
    versionId: string,
): MemoryVersion {
    return {
        versionId,
        scope,
        key,
        createdAt: now,
        previousVersionId: previous ? previous.versionId : null,
        diff: previous ? diffPayloads(previous.payload, payload) : diffPayloads({}, payload),
        payload,
    };
}

/** Rolls back to a kept version. Returns null when the version is not kept. */
export function rollbackToVersion(versions: ReadonlyArray<MemoryVersion>, versionId: string): MemoryVersion | null {
    return versions.find((version) => version.versionId === versionId) ?? null;
}
