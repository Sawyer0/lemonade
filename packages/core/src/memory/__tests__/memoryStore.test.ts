import { describe, it, expect } from 'vitest';
import { InMemoryMemoryScopeStore } from '../memoryStore';

const NOW = '2026-11-11T10:00:00.000Z';

describe('InMemoryMemoryScopeStore', () => {
    it('round-trips a tech profile and a vehicle record by shop and VIN', async () => {
        const store = new InMemoryMemoryScopeStore();
        await store.writeTechProfile({
            techId: 'tech-1',
            shopId: 'shop-1',
            skillLevel: 'journeyman',
            units: 'metric',
            toolsOnHand: [],
            detailPreference: 'standard',
            facts: [],
            changeLog: [],
            updatedAt: NOW,
        });
        await store.writeVehicleRecord({
            shopId: 'shop-1',
            vin: '19XFB2F59FE000000',
            summary: '',
            claims: [],
            updatedAt: NOW,
        });
        expect((await store.readTechProfile('shop-1', 'tech-1'))?.skillLevel).toBe('journeyman');
        expect((await store.readVehicleRecord('shop-1', '19XFB2F59FE000000'))?.vin).toBe('19XFB2F59FE000000');
        expect(await store.readVehicleRecord('shop-2', '19XFB2F59FE000000')).toBeNull();
    });

    it('keeps versions in order and playbook entries per shop', async () => {
        const store = new InMemoryMemoryScopeStore();
        await store.writeVersion({
            versionId: 'v-1',
            scope: 'vehicle_record',
            key: 'shop-1/19XFB2F59FE000000',
            createdAt: NOW,
            previousVersionId: null,
            diff: { added: ['summary'], removed: [], changed: [] },
            payload: { summary: 'Pads 3mm.' },
        });
        await store.writeVersion({
            versionId: 'v-2',
            scope: 'vehicle_record',
            key: 'shop-1/19XFB2F59FE000000',
            createdAt: NOW,
            previousVersionId: 'v-1',
            diff: { added: [], removed: [], changed: ['summary'] },
            payload: { summary: 'Pads 5mm.' },
        });
        const versions = await store.listVersions('vehicle_record', 'shop-1/19XFB2F59FE000000');
        expect(versions.map((version) => version.versionId)).toEqual(['v-1', 'v-2']);

        await store.writePlaybookEntry({
            entryId: 'entry-1',
            shopId: 'shop-1',
            rule: 'Measure pad thickness first.',
            why: 'Pads wear first.',
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
        });
        expect(await store.readPlaybookEntries('shop-1')).toHaveLength(1);
        expect(await store.readPlaybookEntries('shop-2')).toHaveLength(0);
    });
});
