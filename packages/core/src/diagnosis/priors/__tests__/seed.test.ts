import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadSeedFixCounts, SEED_FIX_COUNTS, seedFixCountStore } from '../seed';
import { InMemoryFixCountStore } from '../store';

describe('loadSeedFixCounts', () => {
    it('parses data/priors/seed-p0420.json into exactly SEED_FIX_COUNTS', () => {
        const filePath = path.resolve(process.cwd(), 'data/priors/seed-p0420.json');
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
        expect(loadSeedFixCounts(parsed)).toEqual(SEED_FIX_COUNTS);
    });

    it('throws on a document with the wrong shape instead of loading partial counts', () => {
        expect(() => loadSeedFixCounts({ counts: [{ hypothesis: 'catalytic converter' }] })).toThrowError(
            'Invalid seed fix-count file',
        );
        expect(() => loadSeedFixCounts({})).toThrowError('Invalid seed fix-count file');
    });
});

describe('seedFixCountStore', () => {
    it('loads the seed so priors come back with counts and sources', async () => {
        const store = new InMemoryFixCountStore();
        await seedFixCountStore(store);
        const result = await store.prior({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0420'],
        });
        expect(result.totalObservations).toBe(15);
        expect(result.hypotheses[0]?.hypothesis).toBe('catalytic converter');
        expect(result.hypotheses[0]?.n).toBe(11);
    });
});
