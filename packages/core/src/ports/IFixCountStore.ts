// Field-fix prior counts (LM-33): the store behind prior(caseFacts).
// The in-memory implementation lives in
// packages/core/src/diagnosis/priors/store.ts; the Postgres one in
// packages/infrastructure/src/repositories/PostgresFixCountStore.ts.
// Both aggregate through the same pure priorFromCounts, so the math
// cannot drift between backends.
import type { CaseFacts, FixCount, PriorQueryResult } from '../diagnosis/priors/types';

export interface IFixCountStore {
    /** Records one observation batch, merging into the same key when it already exists. */
    recordFix(count: FixCount): Promise<void>;
    recordFixes(counts: ReadonlyArray<FixCount>): Promise<void>;
    /**
     * prior(caseFacts) -> {hypothesis, n, q, pi} with per-source
     * provenance, ranked by smoothed prior. Returns no hypotheses when
     * nothing was recorded for the key.
     */
    prior(facts: CaseFacts): Promise<PriorQueryResult>;
    listCounts(): Promise<FixCount[]>;
}
