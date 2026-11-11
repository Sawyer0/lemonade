// Prior math (LM-33): raw shares and smoothed probabilities.
//
// A hypothesis with few observations must not outrank one with many, and a
// hypothesis with zero observations in a key must still be possible, so the
// ranking probability `pi` is Lidstone-smoothed: pi_i = (n_i + alpha) /
// (N + alpha * K), where N is the total observations for the key and K the
// number of distinct hypotheses seen for it. With alpha = 1 (Laplace) an
// unseen hypothesis gets 1 / (N + K) — small, never zero — and the pis sum
// to exactly 1. `q` is the raw share n_i / N, kept alongside so a caller can
// tell how much of a prior is evidence and how much is smoothing.
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { PriorHypothesis, PriorSource } from './types';

export interface HypothesisCount {
    hypothesis: string;
    observationCount: number;
    sourceCounts: Partial<Record<PriorSource, number>>;
}

/**
 * Turns raw counts for one key into ranked priors. Throws on a negative
 * count or a non-positive alpha; an empty input returns no hypotheses.
 * Output is sorted by pi descending, then n descending, then hypothesis
 * ascending, so ties are deterministic.
 */
export function computePriorHypotheses(counts: ReadonlyArray<HypothesisCount>, alpha: number): PriorHypothesis[] {
    if (!Number.isFinite(alpha) || alpha <= 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Smoothing alpha must be a positive number');
    }
    const total = counts.reduce((sum, count) => sum + count.observationCount, 0);
    if (total === 0 || counts.length === 0) {
        return [];
    }
    for (const count of counts) {
        if (!Number.isInteger(count.observationCount) || count.observationCount < 0) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'Observation counts must be non-negative integers');
        }
    }
    const distinct = counts.length;
    const denominator = total + alpha * distinct;
    const hypotheses = counts.map((count) => ({
        hypothesis: count.hypothesis,
        n: count.observationCount,
        q: count.observationCount / total,
        pi: (count.observationCount + alpha) / denominator,
        sources: Object.entries(count.sourceCounts)
            .filter(([, sourceCount]) => (sourceCount ?? 0) > 0)
            .map(([source, sourceCount]) => ({
                source: source as PriorSource,
                observationCount: sourceCount ?? 0,
            }))
            .sort((a, b) => b.observationCount - a.observationCount || a.source.localeCompare(b.source)),
    }));
    hypotheses.sort((a, b) => b.pi - a.pi || b.n - a.n || a.hypothesis.localeCompare(b.hypothesis));
    return hypotheses;
}
