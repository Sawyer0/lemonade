import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import { SHARED_CONFIG } from '../config';
import type { PlaybookEntry } from '../types/learnedMemory';

/**
 * Playbook capture and lifecycle (LM-31). One rule per lesson, with a
 * one-clause why, attached to the diagnostic step it affects. The same lesson
 * learned twice is strengthened in place, never appended twice. A wrong entry
 * gets its sentence edited, never an "UPDATE:" underneath. Entries are never
 * deleted, always recoverable; the shop owner pins are exempt from staleness.
 */

export type PlaybookLessonKind = 'fix' | 'negative-tool-claim' | 'setup-problem' | 'narrative';

export interface PlaybookLessonInput {
    rule: string;
    why: string;
    diagnosticStep: string;
    kind: PlaybookLessonKind;
    confirmedByRepair: boolean;
    sourceCaseIds: string[];
    sourceEventIds: string[];
}

export type PlaybookRejection = { ok: true } | { ok: false; reason: string };

const CASE_REFERENCE_PATTERN = /case\s*#?\s*\d+/i;
/** A sentence terminator followed by more text: the why holds more than one clause. */
const MULTI_CLAUSE_WHY_PATTERN = /[.!?]\s+\S/;

/** Never capture as playbook: unconfirmed fixes, negative scanner claims, setup problems, one-off narratives. */
export function checkPlaybookLesson(lesson: PlaybookLessonInput): PlaybookRejection {
    if (!lesson.confirmedByRepair) return { ok: false, reason: 'unconfirmed-fix' };
    if (lesson.kind === 'negative-tool-claim') return { ok: false, reason: 'negative-tool-claim' };
    if (lesson.kind === 'setup-problem') return { ok: false, reason: 'setup-problem' };
    if (lesson.kind === 'narrative') return { ok: false, reason: 'one-off-narrative' };
    if (lesson.rule.trim().length === 0 || lesson.why.trim().length === 0) {
        return { ok: false, reason: 'empty-rule-or-why' };
    }
    if (CASE_REFERENCE_PATTERN.test(lesson.rule) || CASE_REFERENCE_PATTERN.test(lesson.why)) {
        return { ok: false, reason: 'case-reference-in-content' };
    }
    if (MULTI_CLAUSE_WHY_PATTERN.test(lesson.why.trim())) {
        return { ok: false, reason: 'multi-clause-why' };
    }
    return { ok: true };
}

export type PlaybookCapture = { ok: true; entry: PlaybookEntry; strengthened: boolean } | { ok: false; reason: string };

/** Captures a lesson, or strengthens the same lesson in place when it was learned before. */
export function capturePlaybookEntry(
    existing: ReadonlyArray<PlaybookEntry>,
    lesson: PlaybookLessonInput,
    shopId: string,
    now: string,
    entryId: string,
): PlaybookCapture {
    const check = checkPlaybookLesson(lesson);
    if (!check.ok) return check;
    const normalized = lesson.rule.trim().toLowerCase();
    const same = existing.find(
        (entry) => entry.rule.trim().toLowerCase() === normalized && entry.status !== 'archived',
    );
    if (same) {
        return {
            ok: true,
            entry: {
                ...same,
                // A lesson learned again is in use again: a stale entry
                // returns to active. Archived entries are not found here
                // (see above) and still need an explicit restore.
                status: same.status === 'stale' ? 'active' : same.status,
                hitCount: same.hitCount + 1,
                lastUsedAt: now,
                updatedAt: now,
                sourceCaseIds: [...new Set([...same.sourceCaseIds, ...lesson.sourceCaseIds])],
                sourceEventIds: [...new Set([...same.sourceEventIds, ...lesson.sourceEventIds])],
            },
            strengthened: true,
        };
    }
    return {
        ok: true,
        entry: {
            entryId,
            shopId,
            rule: lesson.rule.trim(),
            why: lesson.why.trim(),
            diagnosticStep: lesson.diagnosticStep.trim(),
            status: 'candidate',
            sourceCaseIds: [...lesson.sourceCaseIds],
            sourceEventIds: [...lesson.sourceEventIds],
            confirmedByRepair: lesson.confirmedByRepair,
            lastUsedAt: now,
            hitCount: 1,
            pinned: false,
            createdAt: now,
            updatedAt: now,
        },
        strengthened: false,
    };
}

/** A candidate promotes only through a confirmed repair (LM-23). */
export function promotePlaybookEntry(entry: PlaybookEntry, confirmingCaseId: string, now: string): PlaybookEntry {
    if (!entry.confirmedByRepair) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'A playbook entry promotes only through a confirmed repair.');
    }
    if (!entry.sourceCaseIds.includes(confirmingCaseId)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'The confirming case must be one of the entry source cases.');
    }
    return { ...entry, status: 'active', updatedAt: now };
}

/** A wrong entry gets its sentence edited, never an "UPDATE:" underneath. */
export function editPlaybookEntrySentence(entry: PlaybookEntry, newRule: string, now: string): PlaybookEntry {
    if (newRule.trim().length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'An edited playbook sentence may not be empty.');
    }
    return { ...entry, rule: newRule.trim(), updatedAt: now };
}

const DAY_MS = 86_400_000;

/** Unused 90 days -> stale (not injected); 180 days -> archived. Pinned entries never transition. */
export function advancePlaybookLifecycle(entry: PlaybookEntry, now: string): PlaybookEntry {
    if (entry.pinned) return entry;
    if (entry.status === 'archived') return entry;
    if (entry.status !== 'active' && entry.status !== 'stale') return entry;
    const unusedDays = (Date.parse(now) - Date.parse(entry.lastUsedAt)) / DAY_MS;
    if (unusedDays >= SHARED_CONFIG.MEMORY.PLAYBOOK_ARCHIVE_DAYS) {
        return { ...entry, status: 'archived', updatedAt: now };
    }
    if (entry.status === 'active' && unusedDays >= SHARED_CONFIG.MEMORY.PLAYBOOK_STALE_DAYS) {
        return { ...entry, status: 'stale', updatedAt: now };
    }
    return entry;
}

/** An archived or stale entry is restorable; nothing is ever deleted. */
export function restorePlaybookEntry(entry: PlaybookEntry, now: string): PlaybookEntry {
    if (entry.status === 'active' || entry.status === 'candidate') return entry;
    return { ...entry, status: 'active', lastUsedAt: now, updatedAt: now };
}

/** Only active entries are injected. Stale and archived entries stay out. */
export function isInjectable(entry: PlaybookEntry): boolean {
    return entry.status === 'active';
}

/**
 * Merges entries with the same normalized rule into one, keeping the earliest
 * creation and the latest use. Model consolidation runs only with versioning
 * and rollback; the caller versions the result with memoryVersions.
 */
export function mergeDuplicatePlaybookEntries(entries: ReadonlyArray<PlaybookEntry>, now: string): PlaybookEntry[] {
    const merged = new Map<string, PlaybookEntry>();
    for (const entry of entries) {
        const key = entry.rule.trim().toLowerCase();
        const kept = merged.get(key);
        if (!kept) {
            merged.set(key, entry);
            continue;
        }
        merged.set(key, {
            ...kept,
            hitCount: kept.hitCount + entry.hitCount,
            lastUsedAt: kept.lastUsedAt > entry.lastUsedAt ? kept.lastUsedAt : entry.lastUsedAt,
            createdAt: kept.createdAt < entry.createdAt ? kept.createdAt : entry.createdAt,
            sourceCaseIds: [...new Set([...kept.sourceCaseIds, ...entry.sourceCaseIds])],
            sourceEventIds: [...new Set([...kept.sourceEventIds, ...entry.sourceEventIds])],
            updatedAt: now,
        });
    }
    return [...merged.values()];
}
