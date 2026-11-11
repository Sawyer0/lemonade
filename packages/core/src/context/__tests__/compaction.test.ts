import { describe, it, expect } from 'vitest';
import { SHARED_CONFIG } from '../../config';
import { compactConversation, buildHandoffSummary } from '../compaction';
import { renderCaseSnapshot } from '../snapshot';
import { buildLedger, buildTurns } from './ledgerFixtures';

describe('compactConversation', () => {
    it('returns the snapshot untouched after 200 turns', () => {
        const { caseRecord, entries } = buildLedger(200);
        const snapshot = renderCaseSnapshot(caseRecord, entries);
        const compacted = compactConversation({
            snapshot,
            turns: buildTurns(200),
            toolResults: [{ name: 'obd-scan', output: 'raw scan dump' }],
        });
        expect(compacted.snapshot).toBe(snapshot);
        for (let index = 0; index < 200; index++) {
            const marker =
                index % 9 === 2 ? `observation-fact-${index}` : index % 9 === 7 ? `outcome-fact-${index}` : null;
            if (marker !== null) {
                expect(compacted.snapshot).toContain(marker);
            }
        }
    });

    it('keeps only the recent turns verbatim and summarizes the rest', () => {
        const compacted = compactConversation({
            snapshot: 'SNAPSHOT',
            turns: buildTurns(200),
            toolResults: [{ name: 'obd-scan', output: 'raw scan dump' }],
        });
        expect(compacted.recentTurns).toHaveLength(SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT);
        expect(compacted.recentTurns[0].content).toContain('turn-180');
        expect(compacted.compactedTurnCount).toBe(200 - SHARED_CONFIG.CONTEXT.RECENT_TURN_LIMIT);
        expect(compacted.handoffSummary).not.toBeNull();
        expect(compacted.handoffSummary).toContain('180 earlier turns compacted');
        expect(compacted.handoffSummary).toContain('turn-0 user message');
        expect(compacted.handoffSummary).toContain('turn-178 user message');
        expect(compacted.handoffSummary).toContain('Dropped tool result obd-scan: raw scan dump');
        expect(compacted.droppedToolResultNames).toEqual(['obd-scan']);
    });

    it('returns no handoff summary when nothing is compacted', () => {
        const turns = buildTurns(3);
        const compacted = compactConversation({ snapshot: 'SNAPSHOT', turns, toolResults: [] });
        expect(compacted.snapshot).toBe('SNAPSHOT');
        expect(compacted.recentTurns).toEqual(turns);
        expect(compacted.handoffSummary).toBeNull();
        expect(compacted.compactedTurnCount).toBe(0);
    });

    it('rejects a negative keepRecentTurns', () => {
        expect(() =>
            compactConversation({ snapshot: 'SNAPSHOT', turns: [], toolResults: [], keepRecentTurns: -1 }),
        ).toThrow();
    });
});

describe('buildHandoffSummary', () => {
    it('caps the summary at the configured length', () => {
        const summary = buildHandoffSummary(buildTurns(50), [{ name: 'dump', output: 'x'.repeat(5000) }]);
        expect(summary.length).toBeLessThanOrEqual(SHARED_CONFIG.CONTEXT.HANDOFF_SUMMARY_MAX_CHARS + 1);
        expect(summary).toContain('50 earlier turns compacted');
    });
});
