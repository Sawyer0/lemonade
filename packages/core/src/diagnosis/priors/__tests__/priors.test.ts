import { describe, it, expect } from 'vitest';
import { InMemoryFixCountStore, renderPriorHypotheses } from '../store';
import { seedFixCountStore } from '../seed';
import { ledgerOutcomeToFixCount } from '../ingestion';
import { mileageBandFor, normalizeCaseFacts, type CaseFacts } from '../types';
import type { LedgerEntry } from '../../../types/case';

const civicP0420: CaseFacts = {
    vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
    dtcs: ['P0420'],
};

async function seededStore(): Promise<InMemoryFixCountStore> {
    const store = new InMemoryFixCountStore();
    await seedFixCountStore(store);
    return store;
}

describe('prior(caseFacts) on the seeded store', () => {
    it('returns counts and sources for a seeded vehicle and code', async () => {
        const store = await seededStore();
        const result = await store.prior(civicP0420);
        // Catalytic converter: 9 seeded (P0420) + 2 vehicle-level NHTSA
        // recalls; oxygen sensor: 4. Total 15.
        expect(result.totalObservations).toBe(15);
        expect(result.hypotheses).toHaveLength(2);
        const [top, second] = result.hypotheses;
        expect(top?.hypothesis).toBe('catalytic converter');
        expect(top?.n).toBe(11);
        expect(top?.q).toBeCloseTo(11 / 15, 10);
        expect(top?.pi).toBeCloseTo(12 / 17, 10);
        expect(top?.sources).toContainEqual({ source: 'nhtsa-recalls', observationCount: 2 });
        expect(top?.sources).toContainEqual({ source: 'autorepairbench', observationCount: 6 });
        expect(top?.sources).toContainEqual({ source: 'lemonade-ledger', observationCount: 3 });
        expect(second?.hypothesis).toBe('oxygen sensor');
        expect(second?.n).toBe(4);
    });

    it('returns no hypotheses for a year outside the seeded range', async () => {
        const store = await seededStore();
        const result = await store.prior({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2016, yearTo: 2016, engine: '1.8L' },
            dtcs: ['P0420'],
        });
        expect(result.hypotheses).toEqual([]);
        expect(result.totalObservations).toBe(0);
    });

    it('matches a stored DTC set that is a subset of the query codes', async () => {
        const store = await seededStore();
        const result = await store.prior({ ...civicP0420, dtcs: ['P0300', 'P0420'] });
        expect(result.hypotheses.map((hypothesis) => hypothesis.hypothesis)).toEqual([
            'catalytic converter',
            'ignition coil',
            'spark plugs',
            'oxygen sensor',
        ]);
    });

    it('ranks P0300 with the ignition coil first', async () => {
        const store = await seededStore();
        const result = await store.prior({ ...civicP0420, dtcs: ['P0300'] });
        expect(result.hypotheses[0]?.hypothesis).toBe('ignition coil');
        expect(result.hypotheses[0]?.n).toBe(7);
    });
});

describe('new expert-validated outcomes update counts', () => {
    it('a validated confirmed outcome raises the hypothesis count by one', async () => {
        const store = await seededStore();
        const entry: LedgerEntry = {
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
                confirmed: true,
            },
        };
        const ingested = ledgerOutcomeToFixCount(entry, civicP0420, {
            validatorId: 'expert-7',
            validatedAt: new Date('2026-11-11T12:00:00.000Z'),
        });
        expect(ingested.ok).toBe(true);
        if (ingested.ok) {
            await store.recordFix(ingested.count);
        }
        const result = await store.prior(civicP0420);
        expect(result.hypotheses[0]?.n).toBe(12);
        expect(result.hypotheses[0]?.sources).toContainEqual({ source: 'lemonade-ledger', observationCount: 4 });
    });
});

describe('mileage-band matching', () => {
    it('excludes a count whose band differs, includes it when the query names no band', async () => {
        const store = new InMemoryFixCountStore();
        await store.recordFix({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015 },
            dtcs: ['P0420'],
            mileageBand: '60-100k',
            hypothesis: 'catalytic converter',
            observationCount: 5,
            sourceCounts: { 'repair-order': 5 },
        });
        const otherBand = await store.prior({ ...civicP0420, mileageBand: '0-30k' });
        expect(otherBand.hypotheses).toEqual([]);
        const noBand = await store.prior(civicP0420);
        expect(noBand.hypotheses[0]?.n).toBe(5);
        const sameBand = await store.prior({ ...civicP0420, mileageBand: '60-100k' });
        expect(sameBand.hypotheses[0]?.n).toBe(5);
    });
});

describe('normalizeCaseFacts and mileageBandFor', () => {
    it('uppercases, deduplicates, and sorts DTCs', () => {
        expect(
            normalizeCaseFacts({
                vehicle: { make: 'honda', model: 'civic', yearFrom: 2015, yearTo: 2015 },
                dtcs: ['p0420', 'P0420', 'P0300'],
            }).dtcs,
        ).toEqual(['P0300', 'P0420']);
    });

    it('throws on an invalid DTC instead of guessing', () => {
        expect(() =>
            normalizeCaseFacts({
                vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015 },
                dtcs: ['X1234'],
            }),
        ).toThrowError('Invalid case facts');
    });

    it('maps mileage bands at the boundaries', () => {
        expect(mileageBandFor(0)).toBe('0-30k');
        expect(mileageBandFor(29999)).toBe('0-30k');
        expect(mileageBandFor(30000)).toBe('30-60k');
        expect(mileageBandFor(150000)).toBe('150k+');
        expect(() => mileageBandFor(-1)).toThrowError('Mileage must be a non-negative number');
    });
});

describe('renderPriorHypotheses', () => {
    it('renders counts, shares, priors, and provenance as text', async () => {
        const store = await seededStore();
        const result = await store.prior(civicP0420);
        const rendered = renderPriorHypotheses(result);
        expect(rendered).toContain('catalytic converter: n=11');
        expect(rendered).toContain('nhtsa-recalls 2');
        expect(rendered).toContain('Field-fix priors (15 observations)');
    });

    it('says so when there are no priors', () => {
        expect(renderPriorHypotheses({ facts: civicP0420, hypotheses: [], totalObservations: 0 })).toContain(
            'No field-fix priors',
        );
    });
});
