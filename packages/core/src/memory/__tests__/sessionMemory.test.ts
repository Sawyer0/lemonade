import { describe, it, expect } from 'vitest';
import { SHARED_CONFIG } from '../../config';
import type { TechProfile, VehicleRecord } from '../../types/memory';
import { InMemoryMemoryScopeStore } from '../memoryStore';
import { buildSessionMemory, renderTechProfile, renderVehicleSummary } from '../sessionMemory';

const SHOP = 'shop-1';
const OTHER_SHOP = 'shop-2';
const VIN = '19XFB2F59FE000000';
const NOW = '2026-11-11T10:00:00.000Z';

function profile(): TechProfile {
    return {
        techId: 'tech-1',
        shopId: SHOP,
        skillLevel: 'journeyman',
        units: 'metric',
        toolsOnHand: ['smoke machine', 'scope'],
        detailPreference: 'standard',
        facts: [
            {
                factId: 'fact-1',
                text: 'has a smoke machine',
                source: 'voice_confirmation',
                confirmedAt: NOW,
                sourceEventIds: ['e-voice-1'],
            },
        ],
        changeLog: [],
        updatedAt: NOW,
    };
}

function record(summary = ''): VehicleRecord {
    return {
        shopId: SHOP,
        vin: VIN,
        summary,
        claims: [
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
            {
                claimId: 'claim-2',
                shopId: SHOP,
                vin: VIN,
                text: 'Aftermarket downpipe fitted.',
                sourceEventIds: ['e-2'],
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
            },
        ],
        updatedAt: NOW,
    };
}

describe('buildSessionMemory', () => {
    it('starts a second case on the same VIN at the same shop with the vehicle summary injected', async () => {
        const store = new InMemoryMemoryScopeStore();
        await store.writeTechProfile(profile());
        await store.writeVehicleRecord(record());
        const memory = await buildSessionMemory(store, { shopId: SHOP, vin: VIN, techId: 'tech-1' });
        expect(memory.vehicleRecordFound).toBe(true);
        expect(memory.vehicleSummaryText).toContain('Left front pad 3mm.');
        expect(memory.vehicleSummaryText).toContain('Aftermarket downpipe fitted.');
        expect(memory.techProfileText).toContain('has a smoke machine');
        expect(memory.techProfileText).toContain('journeyman');
    });

    it('shows the same VIN at another shop nothing', async () => {
        const store = new InMemoryMemoryScopeStore();
        await store.writeTechProfile(profile());
        await store.writeVehicleRecord(record());
        const memory = await buildSessionMemory(store, { shopId: OTHER_SHOP, vin: VIN, techId: 'tech-1' });
        expect(memory.vehicleRecordFound).toBe(false);
        expect(memory.vehicleSummaryText).toBe('');
        expect(memory.techProfileText).toBe('');
    });

    it('returns an empty summary when no record exists yet', async () => {
        const store = new InMemoryMemoryScopeStore();
        const memory = await buildSessionMemory(store, { shopId: SHOP, vin: VIN, techId: 'tech-1' });
        expect(memory.vehicleRecordFound).toBe(false);
        expect(memory.vehicleSummaryText).toBe('');
    });

    it('freezes the tech profile for the session: later store changes do not change the injected text', async () => {
        const store = new InMemoryMemoryScopeStore();
        await store.writeTechProfile(profile());
        const memory = await buildSessionMemory(store, { shopId: SHOP, vin: VIN, techId: 'tech-1' });
        const changed = profile();
        changed.skillLevel = 'master';
        changed.facts = [];
        await store.writeTechProfile(changed);
        expect(memory.techProfileText).toContain('journeyman');
        expect(memory.techProfileText).toContain('has a smoke machine');
    });
});

describe('injection budgets', () => {
    it('keeps the tech profile within its character budget', () => {
        const long = profile();
        long.toolsOnHand = Array.from({ length: 200 }, (_, index) => `tool-number-${index}-with-a-long-name`);
        const text = renderTechProfile(long);
        expect(text.length).toBeLessThanOrEqual(SHARED_CONFIG.MEMORY.TECH_PROFILE_MAX_CHARS);
    });

    it('keeps the vehicle summary within its character budget and marks what was left out', () => {
        const many = record();
        many.claims = Array.from({ length: 40 }, (_, index) => ({
            claimId: `claim-${index}`,
            shopId: SHOP,
            vin: VIN,
            text: `Claim number ${index} about a long-standing quirk on this vehicle.`,
            sourceEventIds: [`e-${index}`],
            status: 'active' as const,
            createdAt: NOW,
            updatedAt: NOW,
        }));
        const text = renderVehicleSummary(many);
        expect(text.length).toBeLessThanOrEqual(SHARED_CONFIG.MEMORY.VEHICLE_SUMMARY_MAX_CHARS);
        expect(text).toContain('more claims in the ledger');
    });

    it('prefers the stored summary when one exists', () => {
        const text = renderVehicleSummary(record('Known mod: aftermarket downpipe. Prior fix: pads at 41k.'));
        expect(text).toBe('Known mod: aftermarket downpipe. Prior fix: pads at 41k.');
    });
});
