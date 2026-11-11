// Bayes update (LM-04): a recorded test result re-ranks the differential.
//
// Each test's real hit and false-alarm rates come from the library
// (LM-34); LLM-drafted rates were already shrunk toward 0.5 there, so
// this module never sees an unshrunk draft. For a hypothesis the test
// targets, the likelihood is the hit rate on a positive result and
// 1 - hit rate on a negative one. A hypothesis the test does not target
// keeps likelihood 1: the test says nothing about it, and the
// renormalisation still moves its share. OTHER is the "none listed"
// population, so it takes the test's mean false-alarm rate. Each
// targeted hypothesis — and OTHER — leaves a trace entry with the rates
// used, so the posterior can be recomputed from data alone.
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { Differential, LoopTraceEntry, TestOutcome, TestResultInput } from './types';
import type { TestDefinition } from '../tests/testSchema';

export interface TestRates {
    hitRate: number;
    falseAlarmRate: number;
}

export interface UpdateResult {
    differential: Differential;
    trace: LoopTraceEntry[];
}

/**
 * The likelihood of this outcome under a hypothesis with these rates.
 * A test that hits more than it false-alarms is the only kind the
 * schema admits, so a positive result always favours a target.
 */
export function outcomeLikelihood(rates: TestRates, outcome: TestOutcome): number {
    return outcome === 'positive' ? rates.hitRate : 1 - rates.hitRate;
}

/** The likelihood of this outcome when no listed hypothesis holds. */
export function otherLikelihood(test: TestDefinition, outcome: TestOutcome): number {
    const meanFalseAlarm =
        test.targets.reduce((sum, target) => sum + target.falseAlarmRate, 0) / test.targets.length;
    return outcome === 'positive' ? meanFalseAlarm : 1 - meanFalseAlarm;
}

/**
 * Applies one recorded result to the differential. Throws when the
 * test id is unknown to the library or the result names a test that
 * targets none of the hypotheses: a result the loop cannot interpret
 * must fail loudly, never silently re-rank on nothing.
 */
export function bayesUpdate(
    differential: Differential,
    test: TestDefinition,
    result: TestResultInput,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): UpdateResult {
    const targets = new Map(test.targets.map((target) => [target.hypothesisId, target]));
    const priors = new Map<string, number>();
    for (const hypothesis of differential.hypotheses) {
        const target = targets.get(hypothesis.id);
        const rates = target ? effectiveRates(test, hypothesis.id) : undefined;
        priors.set(hypothesis.id, hypothesis.probability * (rates ? outcomeLikelihood(rates, result.outcome) : 1));
    }
    const otherPrior = differential.otherProbability * otherLikelihood(test, result.outcome);
    const total = [...priors.values()].reduce((sum, value) => sum + value, 0) + otherPrior;
    if (!(total > 0)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Test result for ${test.id} leaves no hypothesis possible`);
    }
    const trace: LoopTraceEntry[] = differential.hypotheses
        .filter((hypothesis) => targets.has(hypothesis.id))
        .map((hypothesis) => {
            const rates = effectiveRates(test, hypothesis.id);
            return {
                round: differential.round + 1,
                testId: test.id,
                outcome: result.outcome,
                hypothesisId: hypothesis.id,
                priorProbability: hypothesis.probability,
                posteriorProbability: (priors.get(hypothesis.id) as number) / total,
                hitRate: rates.hitRate,
                falseAlarmRate: rates.falseAlarmRate,
            };
        });
    // OTHER takes the test's mean false-alarm rate as both its hit and
    // false-alarm rate: it is the "no listed cause" population, so a
    // positive result fires at the false-alarm rate.
    const meanFalseAlarm =
        test.targets.reduce((sum, target) => sum + target.falseAlarmRate, 0) / test.targets.length;
    trace.push({
        round: differential.round + 1,
        testId: test.id,
        outcome: result.outcome,
        hypothesisId: 'other',
        priorProbability: differential.otherProbability,
        posteriorProbability: otherPrior / total,
        hitRate: meanFalseAlarm,
        falseAlarmRate: meanFalseAlarm,
    });
    const hypotheses = differential.hypotheses
        .map((hypothesis) => ({ ...hypothesis, probability: (priors.get(hypothesis.id) as number) / total }))
        .sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id));
    return {
        differential: { hypotheses, otherProbability: otherPrior / total, round: differential.round + 1 },
        trace,
    };
}
