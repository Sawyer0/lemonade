import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { LedgerEventReference, VehicleRecord } from '../../types/memory';
import { applyClaim, applySupersede, proposeVehicleClaim, supersedeVehicleClaim } from '../vehicleClaimPolicy';

const SHOP = 'shop-1';
const VIN = '19XFB2F59FE000000';
const NOW = '2026-11-11T10:00:00.000Z';

/** Asserts the call throws an AppError with the expected code. */
function expectAppError(run: () => unknown, code: ErrorCode): void {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(code);
        return;
    }
    expect.unreachable('Expected the call to throw an AppError.');
}

function event(
    eventId: string,
    type: LedgerEventReference['type'],
    source: LedgerEventReference['source'],
    text?: string,
): LedgerEventReference {
    return { eventId, caseId: 'case-1', type, source, createdAt: NOW, text };
}

function emptyRecord(): VehicleRecord {
    return { shopId: SHOP, vin: VIN, summary: '', claims: [], updatedAt: NOW };
}

describe('proposeVehicleClaim', () => {
    it('accepts a claim cited from a tech observation', () => {
        const events = [event('e-1', 'observation', 'tech', 'Left front pad 3mm.')];
        const proposal = proposeVehicleClaim(
            emptyRecord(),
            { text: 'Left front pad 3mm.', sourceEventIds: ['e-1'] },
            events,
            NOW,
        );
        expect(proposal.ok).toBe(true);
        if (proposal.ok) {
            expect(proposal.claim.sourceEventIds).toEqual(['e-1']);
            expect(proposal.claim.status).toBe('active');
        }
    });

    it('gives two claims from the same record state different ids', () => {
        const events = [
            event('e-1', 'observation', 'tech', 'Left front pad 3mm.'),
            event('e-2', 'observation', 'tech', 'Right front pad 4mm.'),
        ];
        const first = proposeVehicleClaim(
            emptyRecord(),
            { text: 'Left front pad 3mm.', sourceEventIds: ['e-1'] },
            events,
            NOW,
        );
        const second = proposeVehicleClaim(
            emptyRecord(),
            { text: 'Right front pad 4mm.', sourceEventIds: ['e-2'] },
            events,
            NOW,
        );
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(first.claim.claimId).not.toBe(second.claim.claimId);
    });

    it('rejects a claim whose only source is a model event', () => {
        const events = [event('e-1', 'hypothesis', 'model', 'Worn pads.')];
        const proposal = proposeVehicleClaim(
            emptyRecord(),
            { text: 'Worn pads.', sourceEventIds: ['e-1'] },
            events,
            NOW,
        );
        expect(proposal).toEqual({ ok: false, reason: 'model-sourced-event:e-1' });
    });

    it('rejects a claim citing an event that is not in the ledger', () => {
        const proposal = proposeVehicleClaim(
            emptyRecord(),
            { text: 'Worn pads.', sourceEventIds: ['e-missing'] },
            [],
            NOW,
        );
        expect(proposal).toEqual({ ok: false, reason: 'unknown-source-event:e-missing' });
    });

    it('rejects a claim with no source events', () => {
        const proposal = proposeVehicleClaim(emptyRecord(), { text: 'Worn pads.', sourceEventIds: [] }, [], NOW);
        expect(proposal).toEqual({ ok: false, reason: 'missing-source-events' });
    });

    it('reports a duplicate claim instead of recording it twice', () => {
        const events = [event('e-1', 'observation', 'tech', 'Left front pad 3mm.')];
        const record = applyClaim(
            emptyRecord(),
            {
                claimId: 'claim-1',
                shopId: SHOP,
                vin: VIN,
                text: 'Left front pad 3mm.',
                sourceEventIds: ['e-1'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
            NOW,
        );
        const proposal = proposeVehicleClaim(
            record,
            { text: 'left front pad 3mm.', sourceEventIds: ['e-1'] },
            events,
            NOW,
        );
        expect(proposal).toEqual({ ok: true, claim: expect.objectContaining({ claimId: 'claim-1' }), duplicate: true });
    });
});

describe('supersedeVehicleClaim', () => {
    it('supersedes the old claim instead of leaving it standing', () => {
        const events = [
            event('e-1', 'observation', 'tech', 'Left front pad 3mm.'),
            event('e-2', 'observation', 'tech', 'Left front pad 5mm after new pads.'),
        ];
        const record = applyClaim(
            emptyRecord(),
            {
                claimId: 'claim-1',
                shopId: SHOP,
                vin: VIN,
                text: 'Left front pad 3mm.',
                sourceEventIds: ['e-1'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
            NOW,
        );
        const proposal = supersedeVehicleClaim(
            record,
            'claim-1',
            { text: 'Left front pad 5mm after new pads.', sourceEventIds: ['e-2'] },
            events,
            NOW,
        );
        expect(proposal.ok).toBe(true);
        if (!proposal.ok) return;
        const next = applySupersede(record, proposal.claim, NOW);
        expect(next.claims.find((claim) => claim.claimId === 'claim-1')?.status).toBe('superseded');
        expect(proposal.claim.supersedesClaimId).toBe('claim-1');
        expect(proposal.claim.status).toBe('active');
    });

    it('rejects superseding a claim that is not active', () => {
        const proposal = supersedeVehicleClaim(
            emptyRecord(),
            'claim-missing',
            { text: 'New pads.', sourceEventIds: ['e-1'] },
            [event('e-1', 'observation', 'tech', 'New pads.')],
            NOW,
        );
        expect(proposal).toEqual({ ok: false, reason: 'unknown-active-claim:claim-missing' });
    });
});

describe('applySupersede', () => {
    it('throws when the superseded claim is not in the record', () => {
        expectAppError(
            () =>
                applySupersede(
                    emptyRecord(),
                    {
                        claimId: 'claim-2',
                        shopId: SHOP,
                        vin: VIN,
                        text: 'Left front pad 5mm after new pads.',
                        sourceEventIds: ['e-2'],
                        supersedesClaimId: 'claim-missing',
                        status: 'active',
                        createdAt: NOW,
                        updatedAt: NOW,
                    },
                    NOW,
                ),
            ErrorCode.VALIDATION_ERROR,
        );
    });

    it('throws when the superseded claim is already superseded', () => {
        const record = applyClaim(
            emptyRecord(),
            {
                claimId: 'claim-1',
                shopId: SHOP,
                vin: VIN,
                text: 'Left front pad 3mm.',
                sourceEventIds: ['e-1'],
                status: 'superseded',
                createdAt: NOW,
                updatedAt: NOW,
            },
            NOW,
        );
        expectAppError(
            () =>
                applySupersede(
                    record,
                    {
                        claimId: 'claim-2',
                        shopId: SHOP,
                        vin: VIN,
                        text: 'Left front pad 5mm after new pads.',
                        sourceEventIds: ['e-2'],
                        supersedesClaimId: 'claim-1',
                        status: 'active',
                        createdAt: NOW,
                        updatedAt: NOW,
                    },
                    NOW,
                ),
            ErrorCode.VALIDATION_ERROR,
        );
    });
});
