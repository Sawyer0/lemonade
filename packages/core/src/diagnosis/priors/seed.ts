// Seed priors (LM-33): a synthetic fixture, not real-world frequencies.
//
// The seed exists so the done-when check "for a seeded vehicle/code,
// priors come back with counts and sources" can be verified without a
// production feed: a 2015 Honda Civic, P0420 and P0300, with small counts
// from the eval/seed sources. The motivating real-world figure from the
// issue — P0420 -> catalytic converter, verified 1,225 times in shop
// data (Snap-on SureTrack style) — is NOT in here: no licensed feed in
// this repo carries that count, and inventing provenance for it would be
// fabrication. Replace this seed with licensed feed counts when one
// lands; the per-source provenance on each row is what makes that swap
// auditable.
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { FixCount } from './types';
import { FixCountSchema, normalizeFixCount } from './types';
import type { IFixCountStore } from '../../ports/IFixCountStore';

export const SEED_VEHICLE = {
    make: 'Honda',
    model: 'Civic',
    yearFrom: 2015,
    yearTo: 2015,
    engine: '1.8L',
} as const;

export const SEED_FIX_COUNTS: ReadonlyArray<FixCount> = [
    normalizeFixCount({
        vehicle: { ...SEED_VEHICLE },
        dtcs: ['P0420'],
        hypothesis: 'catalytic converter',
        observationCount: 9,
        sourceCounts: { autorepairbench: 6, 'lemonade-ledger': 3 },
    }),
    normalizeFixCount({
        vehicle: { ...SEED_VEHICLE },
        dtcs: ['P0420'],
        hypothesis: 'oxygen sensor',
        observationCount: 4,
        sourceCounts: { autorepairbench: 3, 'repair-order': 1 },
    }),
    normalizeFixCount({
        vehicle: { ...SEED_VEHICLE },
        dtcs: ['P0300'],
        hypothesis: 'ignition coil',
        observationCount: 7,
        sourceCounts: { autorepairbench: 5, 'lemonade-ledger': 2 },
    }),
    normalizeFixCount({
        vehicle: { ...SEED_VEHICLE },
        dtcs: ['P0300'],
        hypothesis: 'spark plugs',
        observationCount: 5,
        sourceCounts: { autorepairbench: 4, 'repair-order': 1 },
    }),
    // Vehicle-level NHTSA observation: a recall names the component, not a
    // code, so it counts for the vehicle whatever the DTC set is.
    normalizeFixCount({
        vehicle: { ...SEED_VEHICLE },
        dtcs: [],
        hypothesis: 'catalytic converter',
        observationCount: 2,
        sourceCounts: { 'nhtsa-recalls': 2 },
    }),
];

/** Loads the seed fixture into a store. */
export async function seedFixCountStore(store: IFixCountStore): Promise<void> {
    await store.recordFixes(SEED_FIX_COUNTS);
}

// --- The seed file (data/priors/seed-p0420.json) ---
// The JSON file is the same fixture as SEED_FIX_COUNTS, in the shape an
// ingestion script hands over: a `{counts: [...]}` document. The loader
// is the ingestion path for it — nothing reads the file raw — so the file
// and the constant cannot drift apart silently: seed.test.ts parses the
// file and expects exactly SEED_FIX_COUNTS.
export const SeedFixCountsFileSchema = z.object({
    counts: z.array(FixCountSchema),
});

/**
 * Parses a seed file document into normalized counts. Throws an AppError
 * on a bad shape instead of loading partial counts.
 */
export function loadSeedFixCounts(input: unknown): FixCount[] {
    const parsed = SeedFixCountsFileSchema.safeParse(input);
    if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid seed fix-count file: ${parsed.error.message}`);
    }
    return parsed.data.counts.map((count) => normalizeFixCount(count));
}
