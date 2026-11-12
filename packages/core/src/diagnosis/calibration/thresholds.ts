// Cost-set thresholds (LM-37): the commit threshold τ is computed per
// case at runtime from LM-34 costs, floored at tau_floor; the safety
// gate and the OTHER escalation read their thresholds from the
// generated config, falling back to the shared config hooks.
//
// C_wrong_repair is the cost of repairing wrongly: the repair itself,
// plus the cost of continuing afterwards (the next-best-test path,
// the same continue cost the stop rule's expected-repair-cost already
// uses). C_next_best_test is the expected cost of that next test.
import { SHARED_CONFIG } from '../../config';
import type { GeneratedCalibrationConfig, ResolvedCase } from './types';

/** The spec's design starting points, used when no generated config exists. */
export const DEFAULT_TAU_FLOOR = 0.8;

export interface CalibrationThresholds {
    tauFloor: number;
    epsSafety: number;
    otherEscalate: number;
}

/** Effective thresholds: the generated config wins, the shared config hooks are the fallback. */
export function resolveThresholds(config: GeneratedCalibrationConfig | null): CalibrationThresholds {
    const loop = SHARED_CONFIG.DIAGNOSTIC_LOOP;
    return {
        tauFloor: config?.thresholds.tau_floor ?? DEFAULT_TAU_FLOOR,
        epsSafety: config?.thresholds.eps_safety ?? loop.SAFETY_RELEASE_MAX_PROBABILITY,
        otherEscalate: config?.thresholds.other_escalate ?? loop.OTHER_ESCALATE_THRESHOLD,
    };
}

export interface CommitThresholdInput {
    wrongRepairCostUsd: number;
    nextBestTestCostUsd: number;
    tauFloor: number;
}

/**
 * τ = C_wrong_repair / (C_wrong_repair + C_next_best_test), floored at
 * tau_floor. Returns null when either cost is missing or not positive:
 * the caller then falls back to the shared config's fixed commit
 * threshold instead of inventing a τ.
 */
export function commitThresholdUsd(input: CommitThresholdInput): number | null {
    const { wrongRepairCostUsd, nextBestTestCostUsd, tauFloor } = input;
    if (
        !Number.isFinite(wrongRepairCostUsd) ||
        !Number.isFinite(nextBestTestCostUsd) ||
        wrongRepairCostUsd <= 0 ||
        nextBestTestCostUsd <= 0
    ) {
        return null;
    }
    return Math.max(tauFloor, wrongRepairCostUsd / (wrongRepairCostUsd + nextBestTestCostUsd));
}

/**
 * The safety gate: no release and no "no fault found" while any
 * safety-set probability is at or above eps_safety.
 */
export function safetyBlocksRelease(safetyProbabilities: number[], epsSafety: number): boolean {
    return safetyProbabilities.some((probability) => probability >= epsSafety);
}

export interface ThresholdCandidate {
    tauFloor: number;
    epsSafety: number;
    otherEscalate: number;
}

interface TunedHoldoutCase {
    calibratedProbability: number;
    safetyProbability: number;
    otherProbability: number;
    label: ResolvedCase['label'];
    trueCauseSafetyCritical: boolean;
}

/**
 * Tunes the thresholds on the holdout: the first candidate, in
 * least-conservative-first order, whose simulated commits keep the
 * wrong-repair rate at or under 5% with zero safety misses. A safety
 * miss is counted independently of the commit filter, so the check can
 * actually reject a candidate: a holdout case that would have
 * committed on probability and OTHER alone (calibrated P at or above
 * τ, OTHER below other_escalate) but was saved by the safety gate
 * (safetyProbability at or above eps_safety), where the commit would
 * have been a wrong repair (label 0) while the true cause was
 * safety-critical. Counting misses among the committed cases instead
 * would be vacuous — the filter already excludes every case at or
 * above eps_safety, so that count could never exceed zero. Returns
 * null when no candidate meets the bar, so the caller keeps the
 * defaults and says so.
 */
export function tuneThresholds(
    holdout: TunedHoldoutCase[],
    candidates: ThresholdCandidate[],
): ThresholdCandidate | null {
    for (const candidate of candidates) {
        const committed = holdout.filter(
            (entry) =>
                entry.calibratedProbability >= candidate.tauFloor &&
                entry.safetyProbability < candidate.epsSafety &&
                entry.otherProbability < candidate.otherEscalate,
        );
        if (committed.length === 0) continue;
        const wrong = committed.filter((entry) => entry.label === 0).length;
        const wrongRepairRate = wrong / committed.length;
        const safetyMisses = holdout.filter(
            (entry) =>
                entry.label === 0 &&
                entry.trueCauseSafetyCritical &&
                entry.calibratedProbability >= candidate.tauFloor &&
                entry.otherProbability < candidate.otherEscalate &&
                entry.safetyProbability >= candidate.epsSafety,
        ).length;
        if (wrongRepairRate <= 0.05 && safetyMisses === 0) return candidate;
    }
    return null;
}
