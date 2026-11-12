// CI gate (LM-37): the held-out ECE check. Fails when the dataset hash
// does not match the generated config (the fit is stale), and when the
// holdout ECE exceeds 0.05 for the pooled set or for any group with at
// least 30 holdout cases. Pure: the caller supplies the cases, the
// config, and the dataset hash it computed, so the vitest gate and the
// deterministic replay gate share this one check.
import { calibrateProbability } from './fits';
import { computeEce, type ScoredEntry } from './metrics';
import type { GeneratedCalibrationConfig, ResolvedCase, SubsystemGroup } from './types';

export const GATE_MAX_ECE = 0.05;
export const GATE_MIN_HOLDOUT_N = 30;
export const HOLDOUT_FRACTION = 0.2;

/**
 * The spec's split: by time on `closed_at`, the newest 20% is the
 * holdout and is never used for fitting. At least one case holds out.
 */
export function splitByClosedAt(cases: ResolvedCase[]): { fit: ResolvedCase[]; holdout: ResolvedCase[] } {
    const sorted = [...cases].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    const holdoutCount = Math.max(1, Math.round(sorted.length * HOLDOUT_FRACTION));
    return { fit: sorted.slice(0, sorted.length - holdoutCount), holdout: sorted.slice(sorted.length - holdoutCount) };
}

/**
 * The canonical dataset text the sha256 covers: cases sorted by id,
 * each with its fields in a fixed order. The fit script and the gate
 * both hash this exact string, so a stale fit cannot pass by accident.
 */
export function canonicalDatasetJson(cases: ResolvedCase[]): string {
    const sorted = [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId));
    return JSON.stringify(
        sorted.map((entry) => ({
            caseId: entry.caseId,
            suiteId: entry.suiteId,
            group: entry.group,
            committedHypothesisId: entry.committedHypothesisId,
            trueHypothesisId: entry.trueHypothesisId,
            trueCauseSafetyCritical: entry.trueCauseSafetyCritical,
            trueCauseListed: entry.trueCauseListed,
            rawProbability: entry.rawProbability,
            otherProbability: entry.otherProbability,
            safetyProbability: entry.safetyProbability,
            label: entry.label,
            closedAt: entry.closedAt,
        })),
    );
}

function scoredEntries(cases: ResolvedCase[], config: GeneratedCalibrationConfig): ScoredEntry[] {
    return cases.map((entry) => ({
        calibratedProbability: calibrateProbability(entry.rawProbability, entry.group, config).calibrated,
        label: entry.label,
    }));
}

export interface CalibrationGateInput {
    cases: ResolvedCase[];
    config: GeneratedCalibrationConfig;
    /** sha256 hex of `canonicalDatasetJson(cases)`, computed by the caller. */
    datasetSha256: string;
}

/**
 * Returns one failure string per violated condition, or an empty array
 * when the gate passes. A missing or empty case set is a failure, not
 * a pass: an empty gate would certify nothing.
 */
export function checkCalibrationGate(input: CalibrationGateInput): string[] {
    const failures: string[] = [];
    if (input.cases.length === 0) {
        failures.push('Calibration gate: no resolved cases in the fit dataset.');
        return failures;
    }
    if (input.config.dataset_sha256 !== input.datasetSha256) {
        failures.push(
            'Calibration gate: dataset_sha256 in calibration.generated.json does not match the current ' +
                'dataset; the fit is stale, re-run the fit script.',
        );
    }
    const { holdout } = splitByClosedAt(input.cases);
    const pooledEce = computeEce(scoredEntries(holdout, input.config));
    if (pooledEce > GATE_MAX_ECE) {
        failures.push(
            `Calibration gate: pooled holdout ECE ${pooledEce.toFixed(3)} exceeds ${GATE_MAX_ECE} ` +
                `(n_holdout ${holdout.length}).`,
        );
    }
    const groups = new Set<SubsystemGroup>(holdout.map((entry) => entry.group));
    for (const group of groups) {
        const groupHoldout = holdout.filter((entry) => entry.group === group);
        if (groupHoldout.length < GATE_MIN_HOLDOUT_N) continue;
        const ece = computeEce(scoredEntries(groupHoldout, input.config));
        if (ece > GATE_MAX_ECE) {
            failures.push(
                `Calibration gate: holdout ECE for ${group} is ${ece.toFixed(3)}, exceeding ${GATE_MAX_ECE} ` +
                    `(n_holdout ${groupHoldout.length}).`,
            );
        }
    }
    return failures;
}
