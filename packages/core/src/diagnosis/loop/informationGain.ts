// Information gain (LM-04): the planner's fallback when no test
// discriminates.
//
// Expected entropy reduction of running a test, averaged over its two
// outcomes. The posterior is computed the same way the Bayes update
// does it, without touching the differential: a hypothesis the test does
// not target takes the test's mean false-alarm rate, OTHER takes the
// same mean false-alarm rate.
import type { Differential } from './types';
import type { TestDefinition } from '../tests/testSchema';
import type { TestRates } from './update';
import { meanFalseAlarmRate } from './update';

/** Entropy of a distribution over the hypotheses plus OTHER, in bits. */
export function entropy(probabilities: ReadonlyArray<number>): number {
    let total = 0;
    for (const probability of probabilities) {
        if (probability > 0) {
            total -= probability * Math.log2(probability);
        }
    }
    return total;
}

export function expectedInformationGain(
    differential: Differential,
    test: TestDefinition,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): number {
    const before = entropy([...differential.hypotheses.map((h) => h.probability), differential.otherProbability]);
    const meanFalseAlarm = meanFalseAlarmRate(test, effectiveRates);
    let expectedAfter = 0;
    for (const outcome of ['positive', 'negative'] as const) {
        const likelihoods = differential.hypotheses.map((hypothesis) => {
            const target = test.targets.find((candidate) => candidate.hypothesisId === hypothesis.id);
            if (!target) {
                return outcome === 'positive' ? meanFalseAlarm : 1 - meanFalseAlarm;
            }
            const rates = effectiveRates(test, hypothesis.id);
            return outcome === 'positive' ? rates.hitRate : 1 - rates.hitRate;
        });
        const otherLikelihood = outcome === 'positive' ? meanFalseAlarm : 1 - meanFalseAlarm;
        const outcomeProbability =
            differential.hypotheses.reduce(
                (sum, hypothesis, index) => sum + hypothesis.probability * (likelihoods[index] as number),
                0,
            ) +
            differential.otherProbability * otherLikelihood;
        if (outcomeProbability <= 0) {
            continue;
        }
        const posterior = [
            ...differential.hypotheses.map(
                (hypothesis, index) => (hypothesis.probability * (likelihoods[index] as number)) / outcomeProbability,
            ),
            (differential.otherProbability * otherLikelihood) / outcomeProbability,
        ];
        expectedAfter += outcomeProbability * entropy(posterior);
    }
    return Math.max(0, before - expectedAfter);
}
