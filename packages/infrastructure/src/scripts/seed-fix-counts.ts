import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { loadSeedFixCounts, type CaseFacts } from '@lemonade/core';
import { PostgresFixCountStore } from '../repositories/PostgresFixCountStore';

// Seed the Postgres fix-count store (LM-33) from data/priors/seed-p0420.json.
//
// Usage:
//   LEMONADE_CASE_LEDGER_DATABASE_URL=postgres://... npx tsx \
//     packages/infrastructure/src/scripts/seed-fix-counts.ts
//
// The seed is SYNTHETIC (see the file's _comment): it exists so the
// done-when "for a seeded vehicle/code, priors come back with counts and
// sources" can be verified against the real store without a production
// feed. Replace it with licensed feed counts when one lands. Re-running
// the script merges into the same rows; it never duplicates them.

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

const SEED_FILE = path.resolve(__dirname, '../../../../data/priors/seed-p0420.json');

const SEEDED_VEHICLE_FACTS: CaseFacts = {
    vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
    dtcs: ['P0420'],
};

async function main(): Promise<void> {
    const connectionString = process.env.LEMONADE_CASE_LEDGER_DATABASE_URL;
    if (!connectionString) {
        throw new Error('LEMONADE_CASE_LEDGER_DATABASE_URL is not set; the fix-count store needs a Postgres database');
    }
    const counts = loadSeedFixCounts(JSON.parse(readFileSync(SEED_FILE, 'utf8')) as unknown);
    const pool = new Pool({ connectionString });
    const store = new PostgresFixCountStore(pool);
    try {
        await store.recordFixes(counts);
        const stored = await store.listCounts();
        console.log(`Seeded ${stored.length} fix-count rows from data/priors/seed-p0420.json`);
        const result = await store.prior(SEEDED_VEHICLE_FACTS);
        console.log(`Prior for 2015 Honda Civic 1.8L, P0420 (${result.totalObservations} observations):`);
        for (const hypothesis of result.hypotheses) {
            const provenance = hypothesis.sources
                .map((source) => `${source.source} ${source.observationCount}`)
                .join(', ');
            console.log(
                `  - ${hypothesis.hypothesis}: n=${hypothesis.n}, pi=${hypothesis.pi.toFixed(2)} [${provenance}]`,
            );
        }
    } finally {
        await store.close();
    }
}

main().catch((error: unknown) => {
    console.error('Seeding fix counts failed:', error);
    process.exit(1);
});
