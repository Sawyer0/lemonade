import { describe, it, expect } from 'vitest';
import type { LedgerEventReference, VehicleRecord } from '../../types/memory';
import { isOrphanClaim, verifyVehicleFacts } from '../verifier';

const SHOP = 'shop-1';
const VIN = '19XFB2F59FE000000';
const NOW = '2026-11-11T10:00:00.000Z';

function event(
    eventId: string,
    type: LedgerEventReference['type'],
    source: LedgerEventReference['source'],
): LedgerEventReference {
    return { eventId, caseId: 'case-1', type, source, createdAt: NOW };
}

function record(): VehicleRecord {
    return {
        shopId: SHOP,
        vin: VIN,
        summary: '',
        claims: [
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
            {
                claimId: 'claim-missing',
                shopId: SHOP,
                vin: VIN,
                text: 'Rear pads worn.',
                sourceEventIds: ['e-gone'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
            {
                claimId: 'claim-model',
                shopId: SHOP,
                vin: VIN,
                text: 'Worn pads.',
                sourceEventIds: ['e-model'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
            {
                claimId: 'claim-retired',
                shopId: SHOP,
                vin: VIN,
                text: 'Old claim.',
                sourceEventIds: ['e-gone'],
                status: 'retired',
                createdAt: NOW,
                updatedAt: NOW,
            },
        ],
        updatedAt: NOW,
    };
}

describe('verifyVehicleFacts', () => {
    it('flags claims whose ledger evidence is missing or model-sourced', () => {
        const events = [event('e-1', 'observation', 'tech'), event('e-model', 'hypothesis', 'model')];
        const result = verifyVehicleFacts(record(), events);
        expect(result.checked).toBe(3);
        expect(result.orphans).toEqual(['claim-missing', 'claim-model']);
    });

    it('does not flag a claim grounded in a tech observation', () => {
        const events = [event('e-1', 'observation', 'tech')];
        const single = record();
        single.claims = single.claims.filter((claim) => claim.claimId === 'claim-good');
        expect(verifyVehicleFacts(single, events)).toEqual({ checked: 1, orphans: [] });
    });

    it('checks only new facts when a since timestamp is given', () => {
        const events = [event('e-1', 'observation', 'tech')];
        const result = verifyVehicleFacts(record(), events, '2026-11-12T00:00:00.000Z');
        expect(result).toEqual({ checked: 0, orphans: [] });
    });

    it('treats a superseded claim as out of scope for verification', () => {
        const single = record();
        single.claims = single.claims.map((claim) =>
            claim.claimId === 'claim-missing' ? { ...claim, status: 'superseded' as const } : claim,
        );
        const result = verifyVehicleFacts(single, [event('e-1', 'observation', 'tech')]);
        expect(result.orphans).not.toContain('claim-missing');
    });

    it('isOrphanClaim is false for a grounded claim and true for a model-cited one', () => {
        const events = [event('e-1', 'observation', 'tech'), event('e-model', 'hypothesis', 'model')];
        const current = record();
        expect(isOrphanClaim(current.claims[0], events)).toBe(false);
        expect(isOrphanClaim(current.claims[2], events)).toBe(true);
    });

    it('flags a claim citing an event type that may never source a vehicle fact', () => {
        const events = [event('e-stop', 'safety_stop', 'tech')];
        const single = record();
        single.claims = [
            {
                claimId: 'claim-stop',
                shopId: SHOP,
                vin: VIN,
                text: 'E-stop pressed.',
                sourceEventIds: ['e-stop'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
        ];
        expect(isOrphanClaim(single.claims[0], events)).toBe(true);
        expect(verifyVehicleFacts(single, events).orphans).toEqual(['claim-stop']);
    });
});
