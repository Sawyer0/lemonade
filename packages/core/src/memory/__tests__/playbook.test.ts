import { describe, it, expect } from 'vitest';
import type { PlaybookEntry } from '../../types/learnedMemory';
import {
    advancePlaybookLifecycle,
    capturePlaybookEntry,
    editPlaybookEntrySentence,
    isInjectable,
    mergeDuplicatePlaybookEntries,
    promotePlaybookEntry,
    restorePlaybookEntry,
} from '../playbook';

const SHOP = 'shop-1';
const NOW = '2026-11-11T10:00:00.000Z';

function lesson(overrides: Record<string, unknown> = {}) {
    return {
        rule: 'Measure pad thickness before condemning the caliper.',
        why: 'Pads wear first on this axle.',
        diagnosticStep: 'measure-pads',
        kind: 'fix' as const,
        confirmedByRepair: true,
        sourceCaseIds: ['case-1'],
        sourceEventIds: ['e-2'],
        ...overrides,
    };
}

function entry(overrides: Partial<PlaybookEntry> = {}): PlaybookEntry {
    return {
        entryId: 'entry-1',
        shopId: SHOP,
        rule: 'Measure pad thickness before condemning the caliper.',
        why: 'Pads wear first on this axle.',
        diagnosticStep: 'measure-pads',
        status: 'active',
        sourceCaseIds: ['case-1'],
        sourceEventIds: ['e-2'],
        confirmedByRepair: true,
        lastUsedAt: NOW,
        hitCount: 1,
        pinned: false,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

describe('capturePlaybookEntry', () => {
    it('rejects an unconfirmed fix: an unresolved failure is not a procedure', () => {
        const result = capturePlaybookEntry([], lesson({ confirmedByRepair: false }), SHOP, NOW, 'entry-1');
        expect(result).toEqual({ ok: false, reason: 'unconfirmed-fix' });
    });

    it('rejects a negative scanner claim', () => {
        const result = capturePlaybookEntry(
            [],
            lesson({ kind: 'negative-tool-claim', rule: 'Scanner X cannot read Y.' }),
            SHOP,
            NOW,
            'entry-1',
        );
        expect(result).toEqual({ ok: false, reason: 'negative-tool-claim' });
    });

    it('rejects a shop setup problem and a one-off narrative', () => {
        expect(
            capturePlaybookEntry([], lesson({ kind: 'setup-problem', rule: 'Buy a new scope.' }), SHOP, NOW, 'entry-1'),
        ).toEqual({ ok: false, reason: 'setup-problem' });
        expect(
            capturePlaybookEntry(
                [],
                lesson({ kind: 'narrative', rule: 'The blue truck came back twice.' }),
                SHOP,
                NOW,
                'entry-1',
            ),
        ).toEqual({ ok: false, reason: 'one-off-narrative' });
    });

    it('rejects a rule that carries a case number as content', () => {
        const result = capturePlaybookEntry([], lesson({ rule: 'Do what worked in case 123.' }), SHOP, NOW, 'entry-1');
        expect(result).toEqual({ ok: false, reason: 'case-reference-in-content' });
    });

    it('rejects a case number hidden in the why, not just in the rule', () => {
        const result = capturePlaybookEntry([], lesson({ why: 'It worked in case 123.' }), SHOP, NOW, 'entry-1');
        expect(result).toEqual({ ok: false, reason: 'case-reference-in-content' });
    });

    it('rejects a why that holds more than one clause', () => {
        const result = capturePlaybookEntry(
            [],
            lesson({ why: 'Pads wear first on this axle. Calipers rarely fail.' }),
            SHOP,
            NOW,
            'entry-1',
        );
        expect(result).toEqual({ ok: false, reason: 'multi-clause-why' });
    });

    it('strengthens the same lesson in place instead of appending it twice', () => {
        const first = capturePlaybookEntry([], lesson(), SHOP, NOW, 'entry-1');
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        expect(first.strengthened).toBe(false);
        const second = capturePlaybookEntry(
            [first.entry],
            lesson({ sourceCaseIds: ['case-2'], sourceEventIds: ['e-9'] }),
            SHOP,
            NOW,
            'entry-2',
        );
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.strengthened).toBe(true);
        expect(second.entry.entryId).toBe('entry-1');
        expect(second.entry.hitCount).toBe(2);
        expect(second.entry.sourceCaseIds).toEqual(['case-1', 'case-2']);
    });

    it('creates a candidate that promotes only through a confirmed repair', () => {
        const captured = capturePlaybookEntry([], lesson(), SHOP, NOW, 'entry-1');
        expect(captured.ok).toBe(true);
        if (!captured.ok) return;
        expect(captured.entry.status).toBe('candidate');
        const promoted = promotePlaybookEntry(captured.entry, 'case-1', NOW);
        expect(promoted.status).toBe('active');
        expect(() => promotePlaybookEntry(captured.entry, 'case-other', NOW)).toThrowError(
            'The confirming case must be one of the entry source cases.',
        );
    });
});

describe('editPlaybookEntrySentence', () => {
    it('edits the sentence instead of appending an update underneath', () => {
        const edited = editPlaybookEntrySentence(entry(), 'Measure pad thickness first, every time.', NOW);
        expect(edited.rule).toBe('Measure pad thickness first, every time.');
        expect(edited.rule).not.toContain('UPDATE');
    });
});

describe('playbook lifecycle', () => {
    it('moves an unused entry to stale at 90 days and archived at 180 days, and restores it', () => {
        const unused90 = entry({ lastUsedAt: '2026-08-01T10:00:00.000Z' });
        const stale = advancePlaybookLifecycle(unused90, '2026-11-11T10:00:00.000Z');
        expect(stale.status).toBe('stale');
        expect(isInjectable(stale)).toBe(false);

        const unused180 = entry({ status: 'stale', lastUsedAt: '2026-05-01T10:00:00.000Z' });
        const archived = advancePlaybookLifecycle(unused180, '2026-11-11T10:00:00.000Z');
        expect(archived.status).toBe('archived');

        const restored = restorePlaybookEntry(archived, NOW);
        expect(restored.status).toBe('active');
        expect(isInjectable(restored)).toBe(true);
    });

    it('never transitions a pinned entry', () => {
        const pinned = entry({ pinned: true, lastUsedAt: '2026-01-01T10:00:00.000Z' });
        expect(advancePlaybookLifecycle(pinned, NOW).status).toBe('active');
    });

    it('keeps a recently used entry active', () => {
        expect(advancePlaybookLifecycle(entry(), NOW).status).toBe('active');
    });

    it('returns a stale entry to active when the lesson is learned again', () => {
        const stale = entry({ status: 'stale', hitCount: 3, lastUsedAt: '2026-08-01T10:00:00.000Z' });
        const captured = capturePlaybookEntry(
            [stale],
            lesson({ sourceCaseIds: ['case-2'], sourceEventIds: ['e-9'] }),
            SHOP,
            NOW,
            'entry-2',
        );
        expect(captured.ok).toBe(true);
        if (!captured.ok) return;
        expect(captured.strengthened).toBe(true);
        expect(captured.entry.status).toBe('active');
        expect(captured.entry.hitCount).toBe(4);
        expect(isInjectable(captured.entry)).toBe(true);
    });
});

describe('mergeDuplicatePlaybookEntries', () => {
    it('merges same-rule entries and keeps the earliest creation', () => {
        const merged = mergeDuplicatePlaybookEntries(
            [
                entry({ entryId: 'entry-1', hitCount: 2, createdAt: '2026-11-01T10:00:00.000Z' }),
                entry({ entryId: 'entry-2', hitCount: 3, createdAt: '2026-11-05T10:00:00.000Z' }),
            ],
            NOW,
        );
        expect(merged).toHaveLength(1);
        expect(merged[0].hitCount).toBe(5);
        expect(merged[0].createdAt).toBe('2026-11-01T10:00:00.000Z');
    });
});
