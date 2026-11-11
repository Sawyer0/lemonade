import { describe, it, expect } from 'vitest';
import { computePriorHypotheses } from '../smoothing';

describe('computePriorHypotheses', () => {
    it('returns raw shares and Lidstone-smoothed priors that sum to 1', () => {
        const hypotheses = computePriorHypotheses(
            [
                { hypothesis: 'catalytic converter', observationCount: 9, sourceCounts: { autorepairbench: 9 } },
                { hypothesis: 'oxygen sensor', observationCount: 4, sourceCounts: { autorepairbench: 4 } },
            ],
            1,
        );
        expect(hypotheses).toHaveLength(2);
        const [top, second] = hypotheses as [typeof hypotheses[0], typeof hypotheses[0]];
        expect(top?.hypothesis).toBe('catalytic converter');
        expect(top?.n).toBe(9);
        expect(top?.q).toBeCloseTo(9 / 13, 10);
        expect(top?.pi).toBeCloseTo(10 / 15, 10);
        expect(second?.pi).toBeCloseTo(5 / 15, 10);
        const total = hypotheses.reduce((sum, hypothesis) => sum + hypothesis.pi, 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it('ranks by smoothed prior, not raw count, and breaks ties deterministically', () => {
        const hypotheses = computePriorHypotheses(
            [
                { hypothesis: 'beta cause', observationCount: 2, sourceCounts: {} },
                { hypothesis: 'alpha cause', observationCount: 2, sourceCounts: {} },
            ],
            1,
        );
        expect(hypotheses.map((hypothesis) => hypothesis.hypothesis)).toEqual(['alpha cause', 'beta cause']);
    });

    it('gives a lone hypothesis a prior of 1', () => {
        const hypotheses = computePriorHypotheses(
            [{ hypothesis: 'catalytic converter', observationCount: 1225, sourceCounts: {} }],
            1,
        );
        expect(hypotheses[0]?.pi).toBe(1);
        expect(hypotheses[0]?.q).toBe(1);
    });

    it('returns no hypotheses when there are no observations', () => {
        expect(computePriorHypotheses([], 1)).toEqual([]);
        expect(
            computePriorHypotheses([{ hypothesis: 'catalytic converter', observationCount: 0, sourceCounts: {} }], 1),
        ).toEqual([]);
    });

    it('throws on a non-positive alpha or a negative count', () => {
        expect(() =>
            computePriorHypotheses([{ hypothesis: 'x', observationCount: 1, sourceCounts: {} }], 0),
        ).toThrowError('Smoothing alpha must be a positive number');
        expect(() =>
            computePriorHypotheses([{ hypothesis: 'x', observationCount: -1, sourceCounts: {} }], 1),
        ).toThrowError('Observation counts must be non-negative integers');
    });

    it('keeps per-source provenance on each hypothesis', () => {
        const hypotheses = computePriorHypotheses(
            [
                {
                    hypothesis: 'catalytic converter',
                    observationCount: 9,
                    sourceCounts: { autorepairbench: 6, 'lemonade-ledger': 3 },
                },
            ],
            1,
        );
        expect(hypotheses[0]?.sources).toEqual([
            { source: 'autorepairbench', observationCount: 6 },
            { source: 'lemonade-ledger', observationCount: 3 },
        ]);
    });
});
