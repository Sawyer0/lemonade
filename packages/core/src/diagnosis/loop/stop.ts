// Stop rule (LM-04, calibrated by LM-37): commit, keep testing, or escalate.
//
// Commit when repairing now has the lowest expected cost or the top
// calibrated probability clears its per-case threshold — but never
// past a safety gate: a safety-critical fault (brakes, steering,
// airbags, HV, hydraulics) at or above eps_safety blocks the release.
// Escalate when calibrated OTHER says the real cause probably is not
// listed, when the evidence contradicts every listed cause, when the
// budget or the round cap runs out, or when a safety-critical fault
// stays unresolved with no test left to run it down.
//
// Every probability the rule reads is the calibrated posterior from
// the generated config (LM-37): the raw Bayes posterior is calibrated
// per subsystem group before any comparison. The commit threshold τ
// is computed per case from LM-34 costs — τ = C_wrong_repair /
// (C_wrong_repair + C_next_best_test), floored at tau_floor — and the
// early-commit (ECR) rule still needs the calibrated probability to
// clear that floor. When no repair cost or next test exists, the rule
// falls back to the shared config's fixed commit threshold.
import { SHARED_CONFIG } from '../../config';
import {
    CALIBRATION_CONFIG,
    calibrateOtherMass,
    calibrateProbability,
    commitThresholdUsd,
    resolveThresholds,
    safetyBlocksRelease,
    subsystemGroupForHypothesisId,
} from '../calibration';
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
 * safety gate is checked before a repair is offered. All probabilities
 * below are calibrated; the raw posterior never reaches a comparison.
 */
export function evaluateStop(state: DiagnosticLoopState, context: StopContext): LoopDecision {
    const { differential } = state;
    const leader = differential.hypotheses[0];
    const thresholds = resolveThresholds(CALIBRATION_CONFIG.config);
    const config = CALIBRATION_CONFIG.uncalibrated ? null : CALIBRATION_CONFIG.config;

    if (!leader) {
        return {
            kind: 'escalate',
            reason: 'evidence-inconsistent',
            detail: 'Every listed cause was ruled out by the readings; the real cause is not in the differential.',
        };
    }
    const leaderGroup = subsystemGroupForHypothesisId(leader.id);
    const leaderProbability = calibrateProbability(leader.probability, leaderGroup, config).calibrated;
    const otherProbability = calibrateOtherMass(differential.otherProbability, config).calibrated;
    if (otherProbability > thresholds.otherEscalate) {
        return {
            kind: 'escalate',
            reason: 'other-too-high',
            detail: `OTHER is ${(otherProbability * 100).toFixed(0)}%: the listed causes probably do not include the real one.`,
        };
    }
    if (state.spentUsd >= state.budgetUsd) {
        return {
            kind: 'escalate',
            reason: 'budget-exhausted',
            detail: `Spent $${state.spentUsd.toFixed(0)} of a $${state.budgetUsd.toFixed(0)} budget.`,
        };
    }
    // LM-29: the goal Budget's test-time cap is enforced alongside the
    // dollar cap — a case that has spent its test minutes is over budget
    // even when the dollars have room.
    if (state.budget && state.spentTestMinutes >= state.budget.maxTestCostMinutes) {
        return {
            kind: 'escalate',
            reason: 'budget-exhausted',
            detail: `Test time spent ${state.spentTestMinutes} of ${state.budget.maxTestCostMinutes} budgeted minutes.`,
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
    // target still at or above eps_safety blocks a commit. When no test
    // is left to run it down, that is an escalation, not a release.
    const safetyCandidates = differential.hypotheses
        .filter(
            (hypothesis) =>
                hypothesis.id !== leader.id && state.safetyCriticalHypothesisIds.includes(hypothesis.id),
        )
        .map((hypothesis) => ({
            id: hypothesis.id,
            calibrated: calibrateProbability(
                hypothesis.probability,
                subsystemGroupForHypothesisId(hypothesis.id),
                config,
            ).calibrated,
        }));
    const blockingSafety = safetyBlocksRelease(
        safetyCandidates.map((candidate) => candidate.calibrated),
        thresholds.epsSafety,
    );
    const blockingSafetyId = safetyCandidates.find(
        (candidate) => candidate.calibrated >= thresholds.epsSafety,
    )?.id;
    if (blockingSafety && !context.plan.nextTest) {
        return {
            kind: 'escalate',
            reason: 'safety-critical-unresolved',
            detail: `Safety-critical cause ${blockingSafetyId ?? 'unknown'} is still at or above ${(thresholds.epsSafety * 100).toFixed(1)}% with no test left to run it down.`,
        };
    }

    const repairCost = state.repairCostsUsd[leader.id];
    const bestTestCost =
        context.plan.nextTest !== null
            ? context.plan.nextTest.cost.totalUsd / Math.max(context.plan.nextTest.discriminationProbability, 0.01)
            : Number.POSITIVE_INFINITY;
    const repairNowCheapest =
        repairCost !== undefined && expectedRepairCostUsd(leaderProbability, repairCost, bestTestCost) < bestTestCost;
    // Per-case τ from LM-34 costs, floored at tau_floor; without a
    // repair cost or a next test there is no τ to compute, so the fixed
    // shared-config threshold governs instead.
    const perCaseTau =
        repairCost !== undefined && context.plan.nextTest !== null
            ? commitThresholdUsd({
                  wrongRepairCostUsd: repairCost + bestTestCost,
                  nextBestTestCostUsd: bestTestCost,
                  tauFloor: thresholds.tauFloor,
              })
            : null;
    const commitThreshold = perCaseTau ?? LOOP.COMMIT_PROBABILITY_THRESHOLD;
    const clearsThreshold = leaderProbability >= commitThreshold;
    // ECR still needs the floor: a cheap repair never commits on a
    // shaky posterior, however cheap it is.
    const earlyCommit = repairNowCheapest && leaderProbability >= thresholds.tauFloor;
    if (!blockingSafety && (clearsThreshold || earlyCommit)) {
        return {
            kind: 'repair',
            hypothesisId: leader.id,
            ...(repairCost !== undefined ? { expectedRepairCostUsd: repairCost } : {}),
            reason: clearsThreshold
                ? `Top cause ${leader.id} cleared the commit threshold at ${(leaderProbability * 100).toFixed(0)}% (τ ${(commitThreshold * 100).toFixed(0)}%).`
                : `Repairing ${leader.id} now has the lowest expected cost (calibrated ${(leaderProbability * 100).toFixed(0)}%, floor ${(thresholds.tauFloor * 100).toFixed(0)}%).`,
        };
    }

    // LM-29: when the tech-ask budget is spent and no test the tech need
    // not answer is left to run, the case is over budget — not out of
    // tests. The planner already excludes ask tests at this point, so a
    // null plan here means the only discriminating move left was a
    // question the case can no longer afford.
    if (state.budget && !context.plan.nextTest && state.techAsksUsed >= state.budget.maxTechAsks) {
        return {
            kind: 'escalate',
            reason: 'budget-exhausted',
            detail: `Tech-ask budget spent (${state.techAsksUsed} of ${state.budget.maxTechAsks} asks) with no other test to run.`,
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
