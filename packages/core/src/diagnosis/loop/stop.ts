// Stop rule (LM-04): commit, keep testing, or escalate.
//
// Commit when repairing now has the lowest expected cost or the top
// probability clears its threshold — but never past a safety gate: a
// safety-critical fault (brakes, steering, airbags, HV, hydraulics)
// above ~1% blocks the release. Escalate when OTHER says the real cause
// probably is not listed, when the evidence contradicts every listed
// cause, when the budget or the round cap runs out, or when a
// safety-critical fault stays unresolved with no test left to run it
// down. The thresholds live in config; LM-37 owns calibrating the
// commit threshold, LM-29 the budget, LM-35 the escalation workflow.
import { SHARED_CONFIG } from '../../config';
import type { DiagnosticLoopState, LoopDecision } from './types';
import type { PlanResult } from './planner';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

/**
 * Expected cost of repairing the leader now: the repair itself, plus —
 * when the leader is wrong — the cost of continuing afterwards. Without
 * a known repair cost there is nothing to compare, so the caller falls
 * back to the probability threshold alone.
 */
export function expectedRepairCostUsd(
    leaderProbability: number,
    repairCostUsd: number,
    continueCostUsd: number,
): number {
    return repairCostUsd + (1 - leaderProbability) * continueCostUsd;
}

export interface StopContext {
    plan: PlanResult;
}

/**
 * Decides the loop's next move. The order matters: inconsistent
 * evidence, OTHER, and budget are checked before any commit, and the
 * safety gate is checked before a repair is offered.
 */
export function evaluateStop(state: DiagnosticLoopState, context: StopContext): LoopDecision {
    const { differential } = state;
    const leader = differential.hypotheses[0];

    if (!leader) {
        return {
            kind: 'escalate',
            reason: 'evidence-inconsistent',
            detail: 'Every listed cause was ruled out by the readings; the real cause is not in the differential.',
        };
    }
    if (differential.otherProbability > LOOP.OTHER_ESCALATE_THRESHOLD) {
        return {
            kind: 'escalate',
            reason: 'other-too-high',
            detail: `OTHER is ${(differential.otherProbability * 100).toFixed(0)}%: the listed causes probably do not include the real one.`,
        };
    }
    if (state.spentUsd >= state.budgetUsd) {
        return {
            kind: 'escalate',
            reason: 'budget-exhausted',
            detail: `Spent $${state.spentUsd.toFixed(0)} of a $${state.budgetUsd.toFixed(0)} budget.`,
        };
    }
    if (differential.round >= LOOP.MAX_ROUNDS) {
        return {
            kind: 'escalate',
            reason: 'rounds-exhausted',
            detail: `${LOOP.MAX_ROUNDS} workup rounds ran without a commit.`,
        };
    }

    // The safety gate: any safety-critical cause other than the repair
    // target still above ~1% blocks a commit. When no test is left to
    // run it down, that is an escalation, not a release.
    const blockingSafety = differential.hypotheses.find(
        (hypothesis) =>
            hypothesis.id !== leader.id &&
            state.safetyCriticalHypothesisIds.includes(hypothesis.id) &&
            hypothesis.probability > LOOP.SAFETY_RELEASE_MAX_PROBABILITY,
    );
    if (blockingSafety && !context.plan.nextTest) {
        return {
            kind: 'escalate',
            reason: 'safety-critical-unresolved',
            detail: `Safety-critical cause ${blockingSafety.id} is still at ${(blockingSafety.probability * 100).toFixed(1)}% with no test left to run it down.`,
        };
    }

    const repairCost = state.repairCostsUsd[leader.id];
    const bestTestCost =
        context.plan.nextTest !== null
            ? context.plan.nextTest.cost.totalUsd / Math.max(context.plan.nextTest.discriminationProbability, 0.01)
            : Number.POSITIVE_INFINITY;
    const repairNowCheapest =
        repairCost !== undefined && expectedRepairCostUsd(leader.probability, repairCost, bestTestCost) < bestTestCost;
    if (!blockingSafety && (leader.probability >= LOOP.COMMIT_PROBABILITY_THRESHOLD || repairNowCheapest)) {
        return {
            kind: 'repair',
            hypothesisId: leader.id,
            ...(repairCost !== undefined ? { expectedRepairCostUsd: repairCost } : {}),
            reason:
                leader.probability >= LOOP.COMMIT_PROBABILITY_THRESHOLD
                    ? `Top cause ${leader.id} cleared the commit threshold at ${(leader.probability * 100).toFixed(0)}%.`
                    : `Repairing ${leader.id} now has the lowest expected cost.`,
        };
    }

    if (!context.plan.nextTest) {
        return {
            kind: 'escalate',
            reason: 'no-discriminating-test',
            detail: 'No eligible test speaks to the remaining causes.',
        };
    }
    return { kind: 'next-test', nextTest: context.plan.nextTest, challenger: context.plan.challenger };
}
