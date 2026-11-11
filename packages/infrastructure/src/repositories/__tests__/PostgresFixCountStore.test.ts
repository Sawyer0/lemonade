import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { SEED_FIX_COUNTS, type CaseFacts } from '@lemonade/core';
import { PostgresFixCountStore } from '../PostgresFixCountStore';

// The fix-count Postgres behavior can only be proven against a real
// database: the row merge on record, the key match (NULL engine / mileage
// band as part of the key), and the prior pre-filter. testcontainers gives
// each run a throwaway Postgres; Docker is available on the CI runners.
// There is no Docker in this dev VM, so this file cannot run locally
// there — CI is the check.
describe('PostgresFixCountStore', () => {
    let container: StartedPostgreSqlContainer;
    let pool: Pool;
    let store: PostgresFixCountStore;

    const civicP0420: CaseFacts = {
        vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
        dtcs: ['P0420'],
    };

    beforeAll(async () => {
        container = await new PostgreSqlContainer('postgres:16-alpine').start();
        pool = new Pool({ connectionString: container.getConnectionUri() });
        const sql = readFileSync(path.resolve(process.cwd(), 'db/migrations/0004_fix_counts.sql'), 'utf8');
        await pool.query(sql);
        store = new PostgresFixCountStore(pool);
        await store.recordFixes(SEED_FIX_COUNTS);
    }, 180000);

    afterAll(async () => {
        // Guarded: if beforeAll failed, store/container were never
        // assigned, and an unconditional close would mask the real failure.
        if (store) await store.close();
        if (container) await container.stop();
    });

    it('returns the seeded priors with counts and sources, matching the in-memory store', async () => {
        const result = await store.prior(civicP0420);
        expect(result.totalObservations).toBe(15);
        expect(result.hypotheses).toHaveLength(2);
        expect(result.hypotheses[0]?.hypothesis).toBe('catalytic converter');
        expect(result.hypotheses[0]?.n).toBe(11);
        expect(result.hypotheses[0]?.sources).toContainEqual({ source: 'nhtsa-recalls', observationCount: 2 });
        expect(result.hypotheses[0]?.sources).toContainEqual({ source: 'autorepairbench', observationCount: 6 });
        expect(result.hypotheses[0]?.sources).toContainEqual({ source: 'lemonade-ledger', observationCount: 3 });
        expect(result.hypotheses[1]?.hypothesis).toBe('oxygen sensor');
        expect(result.hypotheses[1]?.n).toBe(4);
    });

    it('merges a repeated record into the same row instead of duplicating it', async () => {
        const count = {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2016, yearTo: 2016 },
            dtcs: ['P0420'],
            hypothesis: 'oxygen sensor',
            observationCount: 2,
            sourceCounts: { 'repair-order': 2 },
        };
        await store.recordFix(count);
        await store.recordFix(count);
        const result = await store.prior({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2016, yearTo: 2016 },
            dtcs: ['P0420'],
        });
        expect(result.hypotheses).toHaveLength(1);
        expect(result.hypotheses[0]?.n).toBe(4);
        expect(result.hypotheses[0]?.sources).toEqual([{ source: 'repair-order', observationCount: 4 }]);
        expect(await store.listCounts()).toHaveLength(6);
    });

    it('matches a stored wildcard model and a DTC subset', async () => {
        await store.recordFix({
            vehicle: { make: 'Honda', model: '*', yearFrom: 2015, yearTo: 2015 },
            dtcs: ['P0420'],
            hypothesis: 'fuel injector',
            observationCount: 3,
            sourceCounts: { autorepairbench: 3 },
        });
        const result = await store.prior({ ...civicP0420, dtcs: ['P0300', 'P0420'] });
        const fuelInjector = result.hypotheses.find((hypothesis) => hypothesis.hypothesis === 'fuel injector');
        expect(fuelInjector?.n).toBe(3);
    });

    it('returns no hypotheses for a year outside the stored range', async () => {
        const result = await store.prior({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2020, yearTo: 2020, engine: '1.8L' },
            dtcs: ['P0420'],
        });
        expect(result.hypotheses).toEqual([]);
        expect(result.totalObservations).toBe(0);
    });

    it('lists stored counts round-tripped through the table', async () => {
        const counts = await store.listCounts();
        const seeded = counts.filter(
            (count) =>
                count.vehicle.make === 'Honda' && count.vehicle.model === 'Civic' && count.vehicle.yearFrom === 2015,
        );
        expect(seeded).toHaveLength(5);
        expect(seeded.find((count) => count.hypothesis === 'ignition coil')?.observationCount).toBe(7);
    });

    it('does not lose an observation when two transactions record the same new key concurrently', async () => {
        const count = {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2017, yearTo: 2017 },
            dtcs: ['P0420'],
            hypothesis: 'oxygen sensor',
            observationCount: 2,
            sourceCounts: { 'repair-order': 2 },
        };
        // Each recordFix runs in its own transaction on its own pooled
        // client, so the two inserts race on the same new key: before the
        // ON CONFLICT fix the second one failed on the unique index and
        // its observation was lost. Either interleaving must merge to 4.
        await Promise.all([store.recordFix(count), store.recordFix(count)]);
        const result = await store.prior({
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2017, yearTo: 2017 },
            dtcs: ['P0420'],
        });
        expect(result.hypotheses).toHaveLength(1);
        expect(result.hypotheses[0]?.n).toBe(4);
        expect(result.hypotheses[0]?.sources).toEqual([{ source: 'repair-order', observationCount: 4 }]);
    });
});
