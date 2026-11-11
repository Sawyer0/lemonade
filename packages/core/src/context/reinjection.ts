import type { LedgerEntry, LedgerEventType } from '../types/case';
import type { ContextTurn } from './types';

/**
 * Snapshot re-injection (LM-21). The talker's sliding window drops old
 * turns, so after each diagnostic milestone the case-facts snapshot is
 * re-injected as the first turn of the next model call. Milestones are the
 * ledger events that move the diagnosis forward: a test result, an outcome,
 * or a safety stop.
 */

export const MILESTONE_EVENT_TYPES: ReadonlyArray<LedgerEventType> = [
    'test_result',
    'outcome',
    'safety_stop',
    // LM-03: a guided-test outcome and a verify-fix verdict move the
    // diagnosis forward, so they re-inject the snapshot like a test result.
    'guided_test',
    'verify_fix',
];

export function isMilestoneEvent(entry: LedgerEntry): boolean {
    return MILESTONE_EVENT_TYPES.includes(entry.type);
}

/** The snapshot as a system turn, marked so the talker can find and refresh it. */
export function snapshotTurn(snapshot: string): ContextTurn {
    return { role: 'system', kind: 'case-snapshot', content: snapshot };
}

/** The handoff summary as a system turn, when compaction produced one. */
export function handoffSummaryTurn(summary: string): ContextTurn {
    return { role: 'system', kind: 'handoff-summary', content: summary };
}

/**
 * True when the ledger holds a milestone event newer than the snapshot the
 * talker already carries (tracked by that snapshot's highest entry
 * sequence). A snapshot that already covers every milestone needs no
 * re-injection.
 */
export function needsSnapshotReinjection(entries: ReadonlyArray<LedgerEntry>, lastSnapshotSequence: number): boolean {
    return entries.some((entry) => isMilestoneEvent(entry) && entry.sequence > lastSnapshotSequence);
}

/**
 * Builds the talker's turn list for the next model call: the snapshot
 * first, then the handoff summary when one exists, then the recent turns.
 * The snapshot leads so the sliding window drops old conversation before
 * it drops the case facts.
 */
export function buildTalkerTurns(
    snapshot: string,
    recentTurns: ReadonlyArray<ContextTurn>,
    handoffSummary: string | null,
): ReadonlyArray<ContextTurn> {
    const turns: ContextTurn[] = [snapshotTurn(snapshot)];
    if (handoffSummary !== null) {
        turns.push(handoffSummaryTurn(handoffSummary));
    }
    turns.push(...recentTurns);
    return turns;
}
