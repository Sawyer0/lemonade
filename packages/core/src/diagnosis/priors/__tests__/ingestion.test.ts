import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    ledgerOutcomeToFixCount,
    parseAutoRepairBenchRecord,
    parseNhtsaFlatFileRow,
    parseNhtsaRecall,
    parseRepairOrderText,
    recordValidatedLedgerOutcome,
} from '../ingestion';
import { InMemoryFixCountStore } from '../store';
import { seedFixCountStore } from '../seed';
import type { CaseFacts, ExpertValidation } from '../types';
import type { LedgerEntry } from '../../../types/case';

const fixturesDir = path.resolve(process.cwd(), 'packages/core/src/diagnosis/priors/__tests__/fixtures');

const nhtsaRows = JSON.parse(readFileSync(path.join(fixturesDir, 'nhtsa-flat-file-rows.json'), 'utf8')) as unknown[];
const benchRecords = JSON.parse(
    readFileSync(path.join(fixturesDir, 'autorepairbench-records.json'), 'utf8'),
) as unknown[];

const civicFacts: CaseFacts = {
    vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
    dtcs: ['P0420'],
};

const validation: ExpertValidation = { validatorId: 'expert-7', validatedAt: new Date('2026-11-11T12:00:00.000Z') };

function outcomeEntry(confirmed: boolean): LedgerEntry {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        caseId: '22222222-2222-4222-8222-222222222222',
        sequence: 3,
        type: 'outcome',
        actor: { kind: 'user', id: 'tech-1' },
        source: 'tech',
        occurredAt: new Date('2026-11-11T11:00:00.000Z'),
        previousHash: 'a'.repeat(64),
        entryHash: 'b'.repeat(64),
        createdAt: new Date('2026-11-11T11:00:00.000Z'),
        payload: {
            repairPerformed: 'Replaced catalytic converter',
            partsReplaced: ['catalytic converter'],
            codesCleared: true,
            symptomGone: true,
            retestPassed: true,
            confirmed,
        },
    };
}

describe('parseNhtsaFlatFileRow', () => {
    it('maps a complaint by component to its cause, vehicle-level (no DTCs)', () => {
        const result = parseNhtsaFlatFileRow(nhtsaRows[1], 'nhtsa-complaints');
        expect(result.skipped).toEqual([]);
        expect(result.counts).toHaveLength(1);
        expect(result.counts[0]?.hypothesis).toBe('catalytic converter');
        expect(result.counts[0]?.dtcs).toEqual([]);
        expect(result.counts[0]?.sourceCounts).toEqual({ 'nhtsa-complaints': 1 });
    });

    it('skips a row whose component has no mapped cause', () => {
        const result = parseNhtsaFlatFileRow(nhtsaRows[2], 'nhtsa-complaints');
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('No mapped cause');
    });

    it('skips an invalid row with the reason', () => {
        const result = parseNhtsaFlatFileRow({ make: 'Honda' }, 'nhtsa-complaints');
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('Invalid NHTSA flat-file row');
    });
});

describe('parseNhtsaRecall', () => {
    it('maps a recall by component, not by substring of its summary', () => {
        const result = parseNhtsaRecall({
            ReportReceivedDate: '06/03/2019',
            Component: 'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE',
            Summary: 'The affected vehicles received a replacement driver air bag inflator as part of a previous Takata recall.',
            Consequence: 'An inflator could rupture.',
            Remedy: 'Dealers will replace the inflator.',
            Notes: '',
            NHTSACampaignNumber: '19V182000',
            Manufacturer: 'Honda (American Honda Motor Co.)',
            ModelYear: '2012',
            Make: 'ACURA',
            Model: 'RDX',
        });
        expect(result.skipped).toEqual([]);
        expect(result.counts[0]?.hypothesis).toBe('driver frontal air bag inflator');
        expect(result.counts[0]?.vehicle.make).toBe('ACURA');
        expect(result.counts[0]?.sourceCounts).toEqual({ 'nhtsa-recalls': 1 });
    });

    it('skips a recall missing make, model, or year', () => {
        const result = parseNhtsaRecall({
            ReportReceivedDate: '06/03/2019',
            Component: 'AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE',
            Summary: '',
            Consequence: '',
            Remedy: '',
            Notes: '',
        });
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('missing make, model');
    });
});

describe('parseAutoRepairBenchRecord', () => {
    it('turns a bench record into one observation for its bench DTC', () => {
        const result = parseAutoRepairBenchRecord(benchRecords[0]);
        expect(result.skipped).toEqual([]);
        expect(result.counts[0]?.dtcs).toEqual(['5D0C']);
        expect(result.counts[0]?.hypothesis).toBe('catalytic converter');
        expect(result.counts[0]?.vehicle).toEqual({ make: 'BMW', model: '*', yearFrom: 1900, yearTo: 2100 });
        expect(result.counts[0]?.sourceCounts).toEqual({ autorepairbench: 1 });
    });

    it('normalizes the repair measure through the term tables', () => {
        const result = parseAutoRepairBenchRecord(benchRecords[1]);
        expect(result.counts[0]?.hypothesis).toBe('oxygen sensor');
    });

    it('skips a record with no DTC in its input', () => {
        const result = parseAutoRepairBenchRecord(benchRecords[2]);
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('names no DTC');
    });

    it('skips a record whose repair measure names no recognized term', () => {
        const result = parseAutoRepairBenchRecord(benchRecords[3]);
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('No recognized repair term');
    });
});

describe('parseRepairOrderText', () => {
    it('clusters free text into per-cause counts for the case facts', () => {
        const result = parseRepairOrderText(
            'Replaced cat, O2 sensor, and another O2 sensor. Cleared P0420.',
            civicFacts,
        );
        expect(result.skipped).toEqual([]);
        expect(result.counts).toEqual([
            expect.objectContaining({ hypothesis: 'oxygen sensor', observationCount: 2 }),
            expect.objectContaining({ hypothesis: 'catalytic converter', observationCount: 1 }),
        ]);
        expect(result.counts[0]?.dtcs).toEqual(['P0420']);
        expect(result.counts[0]?.sourceCounts).toEqual({ 'repair-order': 2 });
    });

    it('skips text with no recognized repair term', () => {
        const result = parseRepairOrderText('Inspected the vehicle and advised the customer.', civicFacts);
        expect(result.counts).toEqual([]);
        expect(result.skipped[0]?.reason).toContain('No recognized repair term');
    });
});

describe('ledgerOutcomeToFixCount', () => {
    it('counts a confirmed outcome only with an expert validation', () => {
        const ingested = ledgerOutcomeToFixCount(outcomeEntry(true), civicFacts, validation);
        expect(ingested.ok).toBe(true);
        if (ingested.ok) {
            expect(ingested.count.hypothesis).toBe('catalytic converter');
            expect(ingested.count.sourceCounts).toEqual({ 'lemonade-ledger': 1 });
        }
    });

    it('skips a confirmed outcome with no expert validation', () => {
        const ingested = ledgerOutcomeToFixCount(outcomeEntry(true), civicFacts, null);
        expect(ingested).toEqual({ ok: false, reason: expect.stringContaining('no expert validation') });
    });

    it('skips an unconfirmed outcome even with a validation', () => {
        const ingested = ledgerOutcomeToFixCount(outcomeEntry(false), civicFacts, validation);
        expect(ingested).toEqual({ ok: false, reason: expect.stringContaining('not confirmed') });
    });

    it('skips a non-outcome entry', () => {
        const entry = outcomeEntry(true);
        const ingested = ledgerOutcomeToFixCount({ ...entry, type: 'observation' } as LedgerEntry, civicFacts, validation);
        expect(ingested.ok).toBe(false);
    });
});

describe('recordValidatedLedgerOutcome', () => {
    it('records a validated confirmed outcome into the store in one call', async () => {
        const store = new InMemoryFixCountStore();
        await seedFixCountStore(store);
        const recorded = await recordValidatedLedgerOutcome(store, outcomeEntry(true), civicFacts, validation);
        expect(recorded.ok).toBe(true);
        const result = await store.prior(civicFacts);
        expect(result.hypotheses[0]?.n).toBe(12);
        expect(result.hypotheses[0]?.sources).toContainEqual({ source: 'lemonade-ledger', observationCount: 4 });
    });

    it('records nothing for an unvalidated outcome', async () => {
        const store = new InMemoryFixCountStore();
        await seedFixCountStore(store);
        const recorded = await recordValidatedLedgerOutcome(store, outcomeEntry(true), civicFacts, null);
        expect(recorded.ok).toBe(false);
        const result = await store.prior(civicFacts);
        expect(result.hypotheses[0]?.n).toBe(11);
    });

    it('records nothing for an unconfirmed outcome', async () => {
        const store = new InMemoryFixCountStore();
        await seedFixCountStore(store);
        const recorded = await recordValidatedLedgerOutcome(store, outcomeEntry(false), civicFacts, validation);
        expect(recorded.ok).toBe(false);
        const result = await store.prior(civicFacts);
        expect(result.hypotheses[0]?.n).toBe(11);
    });
});
