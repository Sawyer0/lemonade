import { describe, it, expect } from 'vitest';
import { SHARED_CONFIG } from '../../../config';
import { buildDifferential, blendKnowledgePrior, applyLogicFilter } from '../hypotheses';
import { misfirePriors } from './fixtures';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

describe('blendKnowledgePrior', () => {
    it('implements pi(h) = (n_h + alpha*q(h)) / (N + alpha)', () => {
        expect(blendKnowledgePrior(9, 13, 0.6, 1)).toBeCloseTo((9 + 0.6) / 14, 10);
        expect(blendKnowledgePrior(0, 13, 0.6, 1)).toBeCloseTo(0.6 / 14, 10);
    });

    it('lets field data dominate the knowledge prior as observations grow', () => {
        expect(blendKnowledgePrior(900, 1000, 0.1, 1)).toBeCloseTo(900.1 / 1001, 10);
    });

    it('throws on a non-positive alpha or a knowledge prior outside [0, 1]', () => {
        expect(() => blendKnowledgePrior(1, 2, 0.5, 0)).toThrow('positive');
        expect(() => blendKnowledgePrior(1, 2, 1.5, 1)).toThrow('probability');
    });
});

describe('buildDifferential', () => {
    it('ranks priors with an explicit OTHER floor and sums to 1', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        expect(differential.hypotheses[0]?.id).toBe('ignition-coil-failure');
        expect(differential.otherProbability).toBe(LOOP.OTHER_FLOOR);
        const total =
            differential.hypotheses.reduce((sum, h) => sum + h.probability, 0) + differential.otherProbability;
        expect(total).toBeCloseTo(1, 10);
        // Coil prior pi 8/17 scaled to leave the OTHER floor.
        expect(differential.hypotheses[0]?.probability).toBeCloseTo((8 / 17) * (1 - LOOP.OTHER_FLOOR), 10);
    });

    it('boosts a TSB-matched prior above an unboosted one with the same count', () => {
        const priors = [
            { hypothesis: 'a-cause', n: 5, q: 0.5, pi: 0.5, sources: [] },
            { hypothesis: 'b-cause', n: 5, q: 0.5, pi: 0.5, sources: [] },
        ];
        const differential = buildDifferential({
            priorHypotheses: priors,
            tsbBoostedHypothesisIds: ['b-cause'],
            testDefinitions: [],
        });
        expect(differential.hypotheses[0]?.id).toBe('b-cause');
        expect(differential.hypotheses[0]?.probability).toBeGreaterThan(differential.hypotheses[1]?.probability ?? 0);
    });

    it('blends a knowledge prior into the field counts when one is supplied', () => {
        const differential = buildDifferential({
            priorHypotheses: misfirePriors(),
            knowledgePriors: { 'spark-plug-fouled': 0.9 },
            testDefinitions: [],
        });
        const plugs = differential.hypotheses.find((h) => h.id === 'spark-plug-fouled');
        // Blend lifts plugs above its raw smoothed share.
        expect(plugs?.probability).toBeGreaterThan((6 / 17) * (1 - LOOP.OTHER_FLOOR));
    });

    it('gives every LLM proposal the same floor probability, never a number from the model', () => {
        const proposalSets = [
            ['exhaust leak', 'wiring fault'],
            ['wiring fault', 'exhaust leak'],
            ['EXHAUST LEAK', 'wiring  fault', 'exhaust leak'],
            ['a brand new cause nobody listed'],
        ];
        for (const proposals of proposalSets) {
            const differential = buildDifferential({
                priorHypotheses: misfirePriors(),
                llmHypotheses: proposals,
                testDefinitions: [],
            });
            const proposed = differential.hypotheses.filter((h) => h.source === 'llm-proposed');
            const unique = [...new Set(proposals.map((p) => p.trim().toLowerCase().replace(/\s+/g, ' ')))];
            expect(proposed).toHaveLength(unique.length);
            for (const hypothesis of proposed) {
                expect(hypothesis.probability).toBeCloseTo(LOOP.LLM_PROPOSAL_PRIOR, 10);
            }
            const total =
                differential.hypotheses.reduce((sum, h) => sum + h.probability, 0) + differential.otherProbability;
            expect(total).toBeCloseTo(1, 10);
        }
    });

    it('does not let an LLM proposal duplicate a prior hypothesis', () => {
        const differential = buildDifferential({
            priorHypotheses: misfirePriors(),
            llmHypotheses: ['ignition-coil-failure', 'something else'],
            testDefinitions: [],
        });
        expect(differential.hypotheses.filter((h) => h.id === 'ignition-coil-failure')).toHaveLength(1);
        expect(differential.hypotheses.filter((h) => h.source === 'llm-proposed')).toHaveLength(1);
    });

    it('splits the non-OTHER mass across proposals when there are no priors at all', () => {
        const differential = buildDifferential({
            priorHypotheses: [],
            llmHypotheses: ['cause-a', 'cause-b'],
            testDefinitions: [],
        });
        expect(differential.hypotheses).toHaveLength(2);
        for (const hypothesis of differential.hypotheses) {
            expect(hypothesis.probability).toBeCloseTo((1 - LOOP.OTHER_FLOOR) / 2, 10);
        }
    });
});

describe('applyLogicFilter', () => {
    it('drops hypotheses a present reading contradicts and moves their mass to OTHER', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const coilBefore = differential.hypotheses.find((h) => h.id === 'ignition-coil-failure')?.probability ?? 0;
        const result = applyLogicFilter(
            differential,
            [{ id: 'compression-ok', present: true }],
            [{ id: 'rule-1', hypothesisId: 'ignition-coil-failure', readingId: 'compression-ok', inconsistentWhen: 'present' }],
        );
        expect(result.dropped).toEqual(['ignition-coil-failure']);
        expect(result.differential.hypotheses.some((h) => h.id === 'ignition-coil-failure')).toBe(false);
        expect(result.differential.otherProbability).toBeCloseTo(LOOP.OTHER_FLOOR + coilBefore, 10);
    });

    it('keeps a hypothesis when the reading it depends on is absent', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const result = applyLogicFilter(
            differential,
            [{ id: 'misfire-moves-with-coil', present: false }],
            [
                {
                    id: 'rule-1',
                    hypothesisId: 'ignition-coil-failure',
                    readingId: 'misfire-moves-with-coil',
                    inconsistentWhen: 'present',
                },
            ],
        );
        expect(result.dropped).toEqual([]);
        expect(result.differential.hypotheses).toHaveLength(3);
    });

    it('ignores rules for readings that were never recorded', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const result = applyLogicFilter(
            differential,
            [],
            [{ id: 'rule-1', hypothesisId: 'ignition-coil-failure', readingId: 'never-recorded', inconsistentWhen: 'present' }],
        );
        expect(result.dropped).toEqual([]);
    });
});
