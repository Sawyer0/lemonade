import { describe, it, expect } from 'vitest';
import type { LedgerEntry } from '../../types/case';
import { renderCaseSnapshot } from '../snapshot';
import { appendToChain, buildCase, buildLedger } from './ledgerFixtures';

describe('renderCaseSnapshot', () => {
    it('contains every ledger fact after 200 entries', () => {
        const { caseRecord, entries } = buildLedger(200);
        const snapshot = renderCaseSnapshot(caseRecord, entries);
        for (let index = 0; index < 200; index++) {
            const marker =
                index % 9 === 0
                    ? `1HGCM82633A${String(index).padStart(6, '0')}`
                    : index % 9 === 1
                      ? `P${String(index).padStart(4, '0')}`
                      : index % 9 === 2
                        ? `observation-fact-${index}`
                        : index % 9 === 3
                          ? `frame-${index}.jpg`
                          : index % 9 === 4
                            ? `test-note-${index}`
                            : index % 9 === 5
                              ? `hypothesis-fact-${index}`
                              : index % 9 === 6
                                ? `safety-fact-${index}`
                                : index % 9 === 7
                                  ? `outcome-fact-${index}`
                                  : `correction-fact-${index}`;
            expect(snapshot).toContain(marker);
        }
    });

    it('renders deterministically', () => {
        const { caseRecord, entries } = buildLedger(50);
        expect(renderCaseSnapshot(caseRecord, entries)).toBe(renderCaseSnapshot(caseRecord, entries));
    });

    it('renders entries in sequence order even when given shuffled', () => {
        const { caseRecord, entries } = buildLedger(20);
        const shuffled = [...entries].reverse();
        const snapshot = renderCaseSnapshot(caseRecord, shuffled);
        const first = snapshot.indexOf('observation-fact-2');
        const later = snapshot.indexOf('observation-fact-11');
        expect(first).toBeGreaterThan(-1);
        expect(later).toBeGreaterThan(-1);
        expect(first).toBeLessThan(later);
    });

    it('keeps a corrected fact visible and marks it superseded', () => {
        const caseRecord = buildCase();
        const entries: LedgerEntry[] = [];
        const original = appendToChain(entries, 'observation', { text: 'rough idle at cold start' });
        entries.push(original);
        const correction = appendToChain(entries, 'correction', { text: 'idle is smooth, the shake is a mount' }, {
            correctsEntryId: original.id,
        });
        entries.push(correction);
        const snapshot = renderCaseSnapshot({ ...caseRecord, id: original.caseId }, entries);
        expect(snapshot).toContain('rough idle at cold start');
        expect(snapshot).toContain('idle is smooth, the shake is a mount');
        expect(snapshot).toContain(`superseded by correction entry #${correction.sequence}`);
    });

    it('renders an empty ledger as a header with no entries', () => {
        const snapshot = renderCaseSnapshot(buildCase(), []);
        expect(snapshot).toContain('ledger entries: 0');
        expect(snapshot).toContain('No ledger entries yet.');
    });

    it('names the case, vehicle, status, and chain head', () => {
        const { caseRecord, entries } = buildLedger(3);
        const snapshot = renderCaseSnapshot(caseRecord, entries);
        expect(snapshot).toContain(`CASE ${caseRecord.id}`);
        expect(snapshot).toContain(`vehicle: "vehicle-1"`);
        expect(snapshot).toContain('status: open');
        expect(snapshot).toContain(`chain head ${entries[entries.length - 1].entryHash}`);
    });
});
