import { describe, it, expect } from 'vitest';
import { buildWikiPage, checkWikiSize, validateWikiPage } from '../wiki';

const SHOP = 'shop-1';
const NOW = '2026-11-11T10:00:00.000Z';

describe('buildWikiPage', () => {
    it('quotes confirmed repairs verbatim and links back to cases', () => {
        const page = buildWikiPage(
            SHOP,
            'F-150',
            [
                {
                    family: 'F-150',
                    caseId: 'case-1',
                    ledgerEventId: 'e-2',
                    quote: 'Pads replaced, noise gone on retest.',
                },
                {
                    family: 'F-150',
                    caseId: 'case-2',
                    ledgerEventId: 'e-5',
                    quote: 'Pads replaced, noise gone on retest.',
                },
            ],
            NOW,
            'wiki-f150',
            null,
        );
        expect(page.quotes).toHaveLength(2);
        expect(page.quotes[0].quote).toBe('Pads replaced, noise gone on retest.');
        expect(page.caseIds).toEqual(['case-1', 'case-2']);
    });

    it('dedupes the same ledger entry quoted twice', () => {
        const page = buildWikiPage(
            SHOP,
            'F-150',
            [
                { family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2', quote: 'Pads replaced.' },
                { family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2', quote: 'Pads replaced.' },
            ],
            NOW,
            'wiki-f150',
            null,
        );
        expect(page.quotes).toHaveLength(1);
    });

    it('refuses a repair from another family and an empty quote', () => {
        expect(() =>
            buildWikiPage(
                SHOP,
                'F-150',
                [{ family: 'Silverado', caseId: 'case-1', ledgerEventId: 'e-2', quote: 'Pads replaced.' }],
                NOW,
                'wiki-f150',
                null,
            ),
        ).toThrowError('belongs to another family');
        expect(() =>
            buildWikiPage(
                SHOP,
                'F-150',
                [{ family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2', quote: '   ' }],
                NOW,
                'wiki-f150',
                null,
            ),
        ).toThrowError('may not be empty');
    });
});

describe('validateWikiPage', () => {
    it('requires every cited case to have a confirmed repair', () => {
        const page = buildWikiPage(
            SHOP,
            'F-150',
            [{ family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2', quote: 'Pads replaced.' }],
            NOW,
            'wiki-f150',
            null,
        );
        expect(() => validateWikiPage(page, ['case-1'])).not.toThrow();
        expect(() => validateWikiPage(page, ['case-other'])).toThrowError('no confirmed repair');
    });
});

describe('checkWikiSize', () => {
    it('flags a page that grew past its sources', () => {
        const page = buildWikiPage(
            SHOP,
            'F-150',
            [{ family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2', quote: 'Pads replaced.' }],
            NOW,
            'wiki-f150',
            null,
        );
        expect(checkWikiSize(page, 100)).toEqual({ ok: true });
        expect(checkWikiSize(page, 5)).toEqual({ ok: false, reason: 'page-grew-past-sources' });
    });
});
