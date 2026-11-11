import { describe, it, expect } from 'vitest';
import { createMemoryVersion, diffPayloads, rollbackToVersion } from '../memoryVersions';

const NOW = '2026-11-11T10:00:00.000Z';
const LATER = '2026-11-11T11:00:00.000Z';

describe('diffPayloads', () => {
    it('reports added, removed, and changed top-level keys', () => {
        const diff = diffPayloads({ summary: 'Old.', claims: ['a'] }, { summary: 'New.', notes: ['n'] });
        expect(diff).toEqual({ added: ['notes'], removed: ['claims'], changed: ['summary'] });
    });

    it('reports no changes for identical payloads', () => {
        expect(diffPayloads({ a: 1 }, { a: 1 })).toEqual({ added: [], removed: [], changed: [] });
    });
});

describe('createMemoryVersion and rollbackToVersion', () => {
    it('creates a new version with a diff, and rollback restores the prior version', () => {
        const first = createMemoryVersion(
            null,
            'vehicle_record',
            'shop-1/19XFB2F59FE000000',
            { summary: 'Pads 3mm.' },
            NOW,
            'v-1',
        );
        expect(first.previousVersionId).toBeNull();
        expect(first.diff.added).toEqual(['summary']);

        const second = createMemoryVersion(
            first,
            'vehicle_record',
            'shop-1/19XFB2F59FE000000',
            { summary: 'Pads 5mm after new pads.' },
            LATER,
            'v-2',
        );
        expect(second.previousVersionId).toBe('v-1');
        expect(second.diff).toEqual({ added: [], removed: [], changed: ['summary'] });

        const restored = rollbackToVersion([first, second], 'v-1');
        expect(restored?.payload).toEqual({ summary: 'Pads 3mm.' });
        expect(rollbackToVersion([first, second], 'v-missing')).toBeNull();
    });
});
