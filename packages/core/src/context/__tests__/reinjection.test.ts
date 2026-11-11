import { describe, it, expect } from 'vitest';
import {
    buildTalkerTurns,
    isMilestoneEvent,
    needsSnapshotReinjection,
    snapshotTurn,
} from '../reinjection';
import { appendToChain, buildLedger } from './ledgerFixtures';
import type { LedgerEntry } from '../../types/case';

describe('isMilestoneEvent', () => {
    it('treats test results, outcomes, and safety stops as milestones', () => {
        const { entries } = buildLedger(9);
        const byType = new Map(entries.map((entry) => [entry.type, entry]));
        expect(isMilestoneEvent(byType.get('test_result') as LedgerEntry)).toBe(true);
        expect(isMilestoneEvent(byType.get('outcome') as LedgerEntry)).toBe(true);
        expect(isMilestoneEvent(byType.get('safety_stop') as LedgerEntry)).toBe(true);
        expect(isMilestoneEvent(byType.get('observation') as LedgerEntry)).toBe(false);
        expect(isMilestoneEvent(byType.get('hypothesis') as LedgerEntry)).toBe(false);
    });
});

describe('needsSnapshotReinjection', () => {
    it('is true when a milestone entry is newer than the carried snapshot', () => {
        const { entries } = buildLedger(9);
        // Entries 1..9; the test_result is sequence 5, so a snapshot at 4 misses it.
        expect(needsSnapshotReinjection(entries, 4)).toBe(true);
        expect(needsSnapshotReinjection(entries, 9)).toBe(false);
    });

    it('is false when only non-milestone entries are newer than the snapshot', () => {
        const { entries } = buildLedger(9);
        const extended = [...entries];
        const next = appendToChain(extended, 'observation', { text: 'a later observation' });
        extended.push(next);
        // Snapshot at 9 covers every milestone (test_result 5, safety_stop 7, outcome 8).
        expect(needsSnapshotReinjection(extended, 9)).toBe(false);
        // Snapshot at 7 misses the outcome at sequence 8.
        expect(needsSnapshotReinjection(extended, 7)).toBe(true);
    });
});

describe('snapshotTurn', () => {
    it('marks the snapshot as a system turn of kind case-snapshot', () => {
        expect(snapshotTurn('SNAPSHOT')).toEqual({ role: 'system', kind: 'case-snapshot', content: 'SNAPSHOT' });
    });
});

describe('buildTalkerTurns', () => {
    it('leads with the snapshot, then the handoff summary, then recent turns', () => {
        const recent = [
            { role: 'user' as const, kind: 'conversation' as const, content: 'it still stalls' },
            { role: 'assistant' as const, kind: 'conversation' as const, content: 'checking pressure' },
        ];
        const turns = buildTalkerTurns('SNAPSHOT', recent, 'HANDOFF');
        expect(turns).toHaveLength(4);
        expect(turns[0]).toEqual({ role: 'system', kind: 'case-snapshot', content: 'SNAPSHOT' });
        expect(turns[1]).toEqual({ role: 'system', kind: 'handoff-summary', content: 'HANDOFF' });
        expect(turns[2]).toEqual(recent[0]);
        expect(turns[3]).toEqual(recent[1]);
    });

    it('skips the handoff turn when there is no summary', () => {
        const recent = [{ role: 'user' as const, kind: 'conversation' as const, content: 'hello' }];
        const turns = buildTalkerTurns('SNAPSHOT', recent, null);
        expect(turns).toHaveLength(2);
        expect(turns[0].kind).toBe('case-snapshot');
        expect(turns[1]).toEqual(recent[0]);
    });
});
