// The field-fix prior store (LM-33): the in-memory implementation the
// tests and the seed run against. The port lives in
// packages/core/src/ports/IFixCountStore.ts.
//
// `prior(facts)` answers the issue's contract: prior(caseFacts) ->
// {hypothesis, n, q, pi} with provenance. A stored count matches a query
// when the vehicle fits (make/model, case-insensitive, '*' wildcard;
// query year inside the stored year range; engine and mileage band match
// when both sides name one), and when the stored DTC set is empty
// (vehicle-level NHTSA observations) or a subset of the query's codes.
// Matching counts are grouped by hypothesis and smoothed in smoothing.ts.
import { SHARED_CONFIG } from '../../config';
import { computePriorHypotheses } from './smoothing';
import type { CaseFacts, FixCount, PriorHypothesis, PriorQueryResult } from './types';
import { normalizeCaseFacts, normalizeFixCount } from './types';
import type { IFixCountStore } from '../../ports/IFixCountStore';

/**
 * Whether one stored count applies to a query. Engine and mileage band
 * only constrain the match when both the count and the query name them;
 * a count recorded without an engine applies to every engine.
 */
export function fixCountMatches(count: FixCount, facts: CaseFacts): boolean {
    const vehicleMatches =
        (count.vehicle.make === '*' || count.vehicle.make === facts.vehicle.make) &&
        (count.vehicle.model === '*' || count.vehicle.model === facts.vehicle.model) &&
        facts.vehicle.yearFrom <= count.vehicle.yearTo &&
        facts.vehicle.yearTo >= count.vehicle.yearFrom &&
        (!count.vehicle.engine ||
            !facts.vehicle.engine ||
            count.vehicle.engine.toLowerCase() === facts.vehicle.engine.toLowerCase());
    if (!vehicleMatches) {
        return false;
    }
    if (count.dtcs.length > 0 && !count.dtcs.every((code) => facts.dtcs.includes(code))) {
        return false;
    }
    if (count.mileageBand && facts.mileageBand && count.mileageBand !== facts.mileageBand) {
        return false;
    }
    return true;
}

/** Groups matching counts by hypothesis and smooths them into ranked priors. Pure: shared with the Postgres store. */
export function priorFromCounts(counts: ReadonlyArray<FixCount>, facts: CaseFacts, alpha: number): PriorQueryResult {
    const grouped = new Map<string, { observationCount: number; sourceCounts: Record<string, number> }>();
    let totalObservations = 0;
    for (const count of counts) {
        if (!fixCountMatches(count, facts)) {
            continue;
        }
        totalObservations += count.observationCount;
        const groupedCount = grouped.get(count.hypothesis) ?? { observationCount: 0, sourceCounts: {} };
        groupedCount.observationCount += count.observationCount;
        for (const [source, sourceCount] of Object.entries(count.sourceCounts)) {
            groupedCount.sourceCounts[source] = (groupedCount.sourceCounts[source] ?? 0) + sourceCount;
        }
        grouped.set(count.hypothesis, groupedCount);
    }
    const hypotheses = computePriorHypotheses(
        [...grouped.entries()].map(([hypothesis, groupedCount]) => ({
            hypothesis,
            observationCount: groupedCount.observationCount,
            sourceCounts: groupedCount.sourceCounts,
        })),
        alpha,
    );
    return { facts, hypotheses, totalObservations };
}

function countsHaveSameKey(left: FixCount, right: FixCount): boolean {
    return (
        left.vehicle.make === right.vehicle.make &&
        left.vehicle.model === right.vehicle.model &&
        left.vehicle.yearFrom === right.vehicle.yearFrom &&
        left.vehicle.yearTo === right.vehicle.yearTo &&
        (left.vehicle.engine ?? null) === (right.vehicle.engine ?? null) &&
        left.dtcs.join(',') === right.dtcs.join(',') &&
        (left.mileageBand ?? null) === (right.mileageBand ?? null) &&
        left.hypothesis === right.hypothesis
    );
}

/** In-memory fix-count store. Counts with the same key merge: observations add, per-source counts add. */
export class InMemoryFixCountStore implements IFixCountStore {
    private readonly counts: FixCount[] = [];

    async recordFix(count: FixCount): Promise<void> {
        const normalized = normalizeFixCount(count);
        const existing = this.counts.find((stored) => countsHaveSameKey(stored, normalized));
        if (existing) {
            existing.observationCount += normalized.observationCount;
            for (const [source, sourceCount] of Object.entries(normalized.sourceCounts)) {
                const key = source as keyof typeof existing.sourceCounts;
                existing.sourceCounts[key] = (existing.sourceCounts[key] ?? 0) + sourceCount;
            }
            return;
        }
        this.counts.push(normalized);
    }

    async recordFixes(counts: ReadonlyArray<FixCount>): Promise<void> {
        for (const count of counts) {
            await this.recordFix(count);
        }
    }

    async prior(factsInput: CaseFacts): Promise<PriorQueryResult> {
        const facts = normalizeCaseFacts(factsInput);
        return priorFromCounts(this.counts, facts, SHARED_CONFIG.PRIORS.SMOOTHING_ALPHA);
    }

    async listCounts(): Promise<FixCount[]> {
        return this.counts.map((count) => normalizeFixCount(count));
    }
}

/** Renders a prior result as a short text block, for context injection into a model call (LM-21 consumer). */
export function renderPriorHypotheses(result: PriorQueryResult): string {
    if (result.hypotheses.length === 0) {
        return 'No field-fix priors recorded for this vehicle and codes.';
    }
    const lines = result.hypotheses.map((hypothesis: PriorHypothesis) => {
        const provenance = hypothesis.sources.map((source) => `${source.source} ${source.observationCount}`).join(', ');
        return `- ${hypothesis.hypothesis}: n=${hypothesis.n}, share=${hypothesis.q.toFixed(2)}, prior=${hypothesis.pi.toFixed(2)} [${provenance}]`;
    });
    return [`Field-fix priors (${result.totalObservations} observations):`, ...lines].join('\n');
}
