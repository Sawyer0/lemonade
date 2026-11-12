// Bayes update (LM-04): a recorded test result re-ranks the differential.
//
// Each test's real hit and false-alarm rates come from the library
// (LM-34); LLM-drafted rates were already shrunk toward 0.5 there, so
// this module never sees an unshrunk draft. For a hypothesis the test
// targets, the likelihood is the hit rate on a positive result and
// 1 - hit rate on a negative one. A hypothesis the test does not target
// takes the test's mean false-alarm rate (positive) or 1 - mean
// (negative): under the single-fault assumption a non-target cause
// being true means the target is false, so the test fires at its
// false-alarm rate. OTHER is the "none listed" population, so it takes
// the same mean false-alarm rate. Each targeted hypothesis — and
// OTHER — leaves a trace entry with the rates used, so the posterior
// can be recomputed from data alone.
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

/**
 * The mean false-alarm rate of a test under the library's effective
 * rates — verified rates pass through, drafts were shrunk in the
 * library. The raw definition rates would disagree with the rates the
 * targeted hypotheses actually use.
 */
export function meanFalseAlarmRate(
    test: TestDefinition,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): number {
    return (
        test.targets.reduce((sum, target) => sum + effectiveRates(test, target.hypothesisId).falseAlarmRate, 0) /
        test.targets.length
    );
}

/** The likelihood of this outcome when no listed hypothesis holds. */
export function otherLikelihood(
    test: TestDefinition,
    outcome: TestOutcome,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): number {
    const meanFalseAlarm = meanFalseAlarmRate(test, effectiveRates);
    return outcome === 'positive' ? meanFalseAlarm : 1 - meanFalseAlarm;
}

/**
 * The likelihood of this outcome under a hypothesis the test does not
 * target: the test fires at its mean false-alarm rate, because under
 * single-fault the target being false is what a non-target cause means.
 */
export function nonTargetLikelihood(
    test: TestDefinition,
    outcome: TestOutcome,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): number {
    return otherLikelihood(test, outcome, effectiveRates);
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
    const meanFalseAlarm = meanFalseAlarmRate(test, effectiveRates);
    const priors = new Map<string, number>();
    for (const hypothesis of differential.hypotheses) {
        const target = targets.get(hypothesis.id);
        const rates = target ? effectiveRates(test, hypothesis.id) : undefined;
        const likelihood = rates
            ? outcomeLikelihood(rates, result.outcome)
            : nonTargetLikelihood(test, result.outcome, effectiveRates);
        priors.set(hypothesis.id, hypothesis.probability * likelihood);
    }
    const otherPrior = differential.otherProbability * otherLikelihood(test, result.outcome, effectiveRates);
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
