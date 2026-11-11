import { describe, it, expect } from 'vitest';
import type { LedgerEventReference, VehicleRecord } from '../../types/memory';
import { createMemoryVersion } from '../memoryVersions';
import { nightlyReviewDue, runNightlyReview } from '../reflection';

const SHOP = 'shop-1';
const VIN = '19XFB2F59FE000000';
const NOW = '2026-11-11T10:00:00.000Z';
const DATE = '2026-11-11';

function event(
    eventId: string,
    type: LedgerEventReference['type'],
    source: LedgerEventReference['source'],
    text?: string,
    caseId = 'case-1',
): LedgerEventReference {
    return { eventId, caseId, type, source, createdAt: NOW, text };
}

function record(): VehicleRecord {
    return {
        shopId: SHOP,
        vin: VIN,
        summary: '',
        claims: [
            {
                claimId: 'claim-wrong',
                shopId: SHOP,
                vin: VIN,
                text: 'Rear pads worn.',
                sourceEventIds: ['e-gone'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
            {
                claimId: 'claim-good',
                shopId: SHOP,
                vin: VIN,
                text: 'Left front pad 3mm.',
                sourceEventIds: ['e-1'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
        ],
        updatedAt: NOW,
    };
}

describe('runNightlyReview', () => {
    it('produces a reflection_only synthesis and retires a claim with no ledger evidence', () => {
        const events = [
            event('e-1', 'observation', 'tech', 'Left front pad 3mm.'),
            event('e-2', 'outcome', 'tech', 'Pads replaced, noise gone on retest.'),
            event('e-3', 'correction', 'tech', 'Not the caliper, the pads.'),
        ];
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            techId: 'tech-1',
            closedCases: [{ caseId: 'case-1', shopId: SHOP, vin: VIN }],
            ledgerEvents: events,
            record: record(),
            proposedCandidates: [
                {
                    rule: 'Measure pad thickness before condemning the caliper.',
                    why: 'Pads wear first on this axle.',
                    diagnosticStep: 'measure-pads',
                    sourceCaseIds: ['case-1'],
                    sourceEventIds: ['e-2'],
                    confirmedByRepair: true,
                },
                {
                    rule: 'Guess the caliper first.',
                    why: 'It feels faster.',
                    diagnosticStep: 'measure-pads',
                    sourceCaseIds: ['case-1'],
                    sourceEventIds: ['e-2'],
                    confirmedByRepair: false,
                },
            ],
            confirmedRepairs: [{ family: 'F-150', caseId: 'case-1', ledgerEventId: 'e-2' }],
            synthesis: 'Tech skips basics and works in metric.',
            now: NOW,
        });
        expect(result.report.authority).toBe('reflection_only');
        expect(result.report.telemetry).toEqual({
            casesReviewed: 1,
            overrides: 1,
            corrections: 1,
            overrideRate: 1,
            correctionRate: 1,
        });
        expect(result.retiredClaims.map((claim) => claim.claimId)).toEqual(['claim-wrong']);
        expect(result.retiredClaims[0].status).toBe('retired');
        expect(result.report.retiredClaimIds).toEqual(['claim-wrong']);
        expect(result.acceptedCandidates).toHaveLength(1);
        expect(result.acceptedCandidates[0].rule).toContain('Measure pad thickness');
        expect(result.wikiFamilies).toEqual(['F-150']);
        expect(result.version).toBeNull();
    });

    it('accepts a candidate only when a confirmed outcome backs it', () => {
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            closedCases: [{ caseId: 'case-1', shopId: SHOP, vin: VIN }],
            ledgerEvents: [event('e-1', 'test_result', 'OBD', 'Pad sensor open.')],
            record: null,
            proposedCandidates: [
                {
                    rule: 'Trust the pad sensor.',
                    why: 'It was right this time.',
                    diagnosticStep: 'read-sensor',
                    sourceCaseIds: ['case-1'],
                    sourceEventIds: ['e-1'],
                    confirmedByRepair: true,
                },
            ],
            confirmedRepairs: [],
            synthesis: 'Quiet night.',
            now: NOW,
        });
        expect(result.acceptedCandidates).toHaveLength(0);
    });

    it('rejects a candidate whose confirming outcome comes from an uncited case', () => {
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            closedCases: [
                { caseId: 'case-1', shopId: SHOP, vin: VIN },
                { caseId: 'case-2', shopId: SHOP, vin: VIN },
            ],
            ledgerEvents: [
                event('e-1', 'test_result', 'OBD', 'Pad sensor open.', 'case-1'),
                event('e-2', 'outcome', 'tech', 'Pads replaced, noise gone on retest.', 'case-2'),
            ],
            record: null,
            proposedCandidates: [
                {
                    rule: 'Trust the pad sensor.',
                    why: 'It was right this time.',
                    diagnosticStep: 'read-sensor',
                    sourceCaseIds: ['case-1'],
                    sourceEventIds: ['e-2'],
                    confirmedByRepair: true,
                },
            ],
            confirmedRepairs: [],
            synthesis: 'Quiet night.',
            now: NOW,
        });
        expect(result.acceptedCandidates).toHaveLength(0);
    });

    it('still produces a synthesis when several corrections land in one case', () => {
        const events = [
            event('e-1', 'observation', 'tech', 'Left front pad 3mm.'),
            event('e-2', 'outcome', 'tech', 'Pads replaced, noise gone on retest.'),
            event('e-3', 'correction', 'tech', 'Not the caliper, the pads.'),
            event('e-4', 'correction', 'tech', 'Not the rear pads either.'),
        ];
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            closedCases: [{ caseId: 'case-1', shopId: SHOP, vin: VIN }],
            ledgerEvents: events,
            record: record(),
            proposedCandidates: [],
            confirmedRepairs: [],
            synthesis: 'Tech corrects twice in one case.',
            now: NOW,
        });
        expect(result.report.authority).toBe('reflection_only');
        expect(result.report.telemetry).toEqual({
            casesReviewed: 1,
            overrides: 1,
            corrections: 1,
            overrideRate: 1,
            correctionRate: 1,
        });
    });

    it('counts rates per case, never per correction event', () => {
        const events = [
            event('e-3', 'correction', 'tech', 'First correction.', 'case-1'),
            event('e-4', 'correction', 'tech', 'Second correction.', 'case-1'),
            event('e-5', 'correction', 'tech', 'Third correction.', 'case-2'),
            event('e-6', 'correction', 'model', 'Model correction.', 'case-3'),
        ];
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            closedCases: [
                { caseId: 'case-1', shopId: SHOP, vin: VIN },
                { caseId: 'case-2', shopId: SHOP, vin: VIN },
                { caseId: 'case-3', shopId: SHOP, vin: VIN },
            ],
            ledgerEvents: events,
            record: null,
            proposedCandidates: [],
            confirmedRepairs: [],
            synthesis: 'Four corrections across three cases.',
            now: NOW,
        });
        expect(result.report.telemetry).toEqual({
            casesReviewed: 3,
            overrides: 2,
            corrections: 3,
            overrideRate: 2 / 3,
            correctionRate: 1,
        });
    });

    it('writes a new memory version with a diff when a versionId is given', () => {
        const previous = createMemoryVersion(
            null,
            'shop',
            SHOP,
            { synthesis: 'Old synthesis.' },
            '2026-11-10T10:00:00.000Z',
            'v-1',
        );
        const result = runNightlyReview({
            date: DATE,
            shopId: SHOP,
            closedCases: [{ caseId: 'case-1', shopId: SHOP, vin: VIN }],
            ledgerEvents: [event('e-1', 'observation', 'tech', 'Left front pad 3mm.')],
            record: null,
            proposedCandidates: [],
            confirmedRepairs: [],
            synthesis: 'Tech skips basics and works in metric.',
            now: NOW,
            previousVersion: previous,
            versionId: 'v-2',
        });
        expect(result.version).not.toBeNull();
        expect(result.version?.versionId).toBe('v-2');
        expect(result.version?.previousVersionId).toBe('v-1');
        expect(result.version?.scope).toBe('shop');
        expect(result.version?.key).toBe(SHOP);
        expect(result.version?.diff.added).toContain('telemetry');
        expect(result.version?.diff.changed).toContain('synthesis');
        expect(result.version?.payload).toBe(result.report);
    });
});

describe('nightlyReviewDue', () => {
    it('is due when cases closed or concerns are open, and not due when nothing changed', () => {
        expect(nightlyReviewDue({ closedCases: 1, openConcerns: 0, mileageDependentOpen: 0 })).toBe(true);
        expect(nightlyReviewDue({ closedCases: 0, openConcerns: 1, mileageDependentOpen: 0 })).toBe(true);
        expect(nightlyReviewDue({ closedCases: 0, openConcerns: 0, mileageDependentOpen: 1 })).toBe(true);
        expect(nightlyReviewDue({ closedCases: 0, openConcerns: 0, mileageDependentOpen: 0 })).toBe(false);
    });
});
