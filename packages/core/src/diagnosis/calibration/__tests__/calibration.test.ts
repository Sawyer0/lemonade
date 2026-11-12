// Calibration unit tests (LM-37): isotonic, Platt and identity fits on
// synthetic data with known calibration, per-case τ, the safety gate,
// the loader fallback, threshold tuning, and the CI gate check.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    applyCalibrationMap,
    calibrateProbability,
    canonicalDatasetJson,
    checkCalibrationGate,
    commitThresholdUsd,
    computeBrier,
    computeEce,
    computeTop1,
    defaultCalibrationConfig,
    fitGroupCalibration,
    fitIsotonic,
    fitPlatt,
    isDegenerateFit,
    reliabilityBins,
    resolveCalibrationConfig,
    resolveThresholds,
    safetyBlocksRelease,
    splitByClosedAt,
    subsystemGroupForHypothesisId,
    tuneThresholds,
    type FitPoint,
    type GeneratedCalibrationConfig,
    type ResolvedCase,
} from '../index';

function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
}

function logit(p: number): number {
    return Math.log(p / (1 - p));
}

/** Points from a known Platt map: true P = sigmoid(2·logit(x) − 0.5). */
function plattPoints(): FitPoint[] {
    const points: FitPoint[] = [];
    for (const x of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const ones = Math.round(20 * sigmoid(2 * logit(x) - 0.5));
        for (let i = 0; i < 20; i += 1) {
            points.push({ x, label: i < ones ? 1 : 0 });
        }
    }
    return points;
}

/** Points from a known step map: 0.2 at x 0.2, 0.5 at x 0.5, 0.9 at x 0.8. */
function isotonicPoints(): FitPoint[] {
    const points: FitPoint[] = [];
    const runs: Array<[number, number, number]> = [
        [0.2, 50, 10],
        [0.5, 100, 50],
        [0.8, 100, 90],
    ];
    for (const [x, count, ones] of runs) {
        for (let i = 0; i < count; i += 1) {
            points.push({ x, label: i < ones ? 1 : 0 });
        }
    }
    return points;
}

describe('fitGroupCalibration', () => {
    it('fits Platt on 30–199 points and recovers the known map', () => {
        const points = plattPoints();
        expect(points).toHaveLength(180);
        const fitted = fitGroupCalibration(points);
        expect(fitted.method).toBe('platt');
        expect(fitted.a).toBeCloseTo(2, 0);
        expect(fitted.b).toBeCloseTo(-0.5, 0);
        const rawEce = computeEce(points.map((point) => ({ calibratedProbability: point.x, label: point.label })));
        const calibratedEce = computeEce(
            points.map((point) => ({ calibratedProbability: applyCalibrationMap(fitted, point.x), label: point.label })),
        );
        expect(calibratedEce).toBeLessThan(rawEce);
        expect(calibratedEce).toBeLessThan(0.05);
    });

    it('fits isotonic on 200+ points and recovers the known steps', () => {
        const points = isotonicPoints();
        expect(points).toHaveLength(250);
        const fitted = fitGroupCalibration(points);
        expect(fitted.method).toBe('isotonic');
        expect(applyCalibrationMap(fitted, 0.2)).toBeCloseTo(0.2, 2);
        expect(applyCalibrationMap(fitted, 0.5)).toBeCloseTo(0.5, 2);
        expect(applyCalibrationMap(fitted, 0.8)).toBeCloseTo(0.9, 2);
        expect(applyCalibrationMap(fitted, 0.1)).toBeLessThanOrEqual(applyCalibrationMap(fitted, 0.9));
        const ece = computeEce(
            points.map((point) => ({ calibratedProbability: applyCalibrationMap(fitted, point.x), label: point.label })),
        );
        expect(ece).toBeLessThan(0.05);
    });

    it('falls back to identity below 30 points', () => {
        const points = plattPoints().slice(0, 10);
        const fitted = fitGroupCalibration(points);
        expect(fitted.method).toBe('identity');
        expect(applyCalibrationMap(fitted, 0.73)).toBe(0.73);
    });

    it('falls back to identity when the fit is degenerate', () => {
        const allCorrect: FitPoint[] = Array.from({ length: 100 }, (_, i) => ({ x: 0.5 + i / 400, label: 1 as const }));
        expect(isDegenerateFit(allCorrect)).toBe(true);
        expect(fitGroupCalibration(allCorrect).method).toBe('identity');
        const flatX: FitPoint[] = Array.from({ length: 100 }, (_, i) => ({ x: 0.8, label: (i % 2) as 0 | 1 }));
        expect(isDegenerateFit(flatX)).toBe(true);
        expect(fitGroupCalibration(flatX).method).toBe('identity');
    });

    it('keeps the isotonic map monotone on non-monotone data', () => {
        const points: FitPoint[] = [
            ...Array.from({ length: 100 }, (_, i) => ({ x: 0.3, label: (i < 90 ? 1 : 0) as 0 | 1 })),
            ...Array.from({ length: 100 }, (_, i) => ({ x: 0.7, label: (i < 10 ? 1 : 0) as 0 | 1 })),
        ];
        const fitted = fitIsotonic(points);
        expect(fitted.method).toBe('isotonic');
        expect(applyCalibrationMap(fitted, 0.3)).toBeLessThanOrEqual(applyCalibrationMap(fitted, 0.7));
    });

    it('fits Platt directly on synthetic data', () => {
        const fitted = fitPlatt(plattPoints());
        expect(fitted.method).toBe('platt');
        expect(fitted.a).toBeGreaterThan(1);
    });
});

describe('calibrateProbability', () => {
    function configWith(map: ReturnType<typeof fitPlatt>): GeneratedCalibrationConfig {
        const base = defaultCalibrationConfig();
        return { ...base, fitted_at: '2026-11-12T00:00:00Z', dataset_sha256: 'abc', groups: { _pooled: { ...map, n_fit: 180, n_holdout: 45 } } };
    }

    it('uses the group map, falls back to _pooled, and marks identity uncalibrated', () => {
        const config = configWith(fitPlatt(plattPoints()));
        const pooled = calibrateProbability(0.9, 'powertrain', config);
        expect(pooled.group).toBe('_pooled');
        expect(pooled.uncalibrated).toBe(false);
        expect(pooled.calibrated).toBeCloseTo(sigmoid(2 * logit(0.9) - 0.5), 1);
        const identity = calibrateProbability(0.9, 'powertrain', null);
        expect(identity).toMatchObject({ calibrated: 0.9, method: 'identity', uncalibrated: true });
    });
});

describe('metrics', () => {
    it('reports zero ECE for perfectly calibrated probabilities', () => {
        const entries = [
            ...Array.from({ length: 10 }, () => ({ calibratedProbability: 0.8, label: 1 as const })),
            ...Array.from({ length: 10 }, () => ({ calibratedProbability: 0.8, label: 1 as const })),
            ...Array.from({ length: 5 }, () => ({ calibratedProbability: 0.8, label: 0 as const })),
        ];
        // 20/25 correct at p 0.8: ECE is exactly 0.
        expect(computeEce(entries)).toBeCloseTo(0, 10);
        expect(computeTop1(entries)).toBeCloseTo(0.8, 10);
        expect(computeBrier(entries)).toBeCloseTo(0.16, 10);
        expect(reliabilityBins(entries).filter((bin) => bin.n > 0)).toHaveLength(1);
    });

    it('reports high ECE for systematically overconfident probabilities', () => {
        const entries = Array.from({ length: 100 }, () => ({ calibratedProbability: 0.95, label: 0 as const }));
        expect(computeEce(entries)).toBeCloseTo(0.95, 10);
        expect(computeBrier(entries)).toBeCloseTo(0.9025, 10);
        expect(computeTop1(entries)).toBe(0);
    });
});

describe('commitThresholdUsd', () => {
    it('computes τ from costs and floors it at tau_floor', () => {
        expect(commitThresholdUsd({ wrongRepairCostUsd: 100, nextBestTestCostUsd: 25, tauFloor: 0.8 })).toBeCloseTo(
            0.8,
            10,
        );
        expect(commitThresholdUsd({ wrongRepairCostUsd: 900, nextBestTestCostUsd: 100, tauFloor: 0.8 })).toBeCloseTo(
            0.9,
            10,
        );
        expect(commitThresholdUsd({ wrongRepairCostUsd: 100, nextBestTestCostUsd: 300, tauFloor: 0.8 })).toBeCloseTo(
            0.8,
            10,
        );
    });

    it('returns null when either cost is missing or not positive', () => {
        expect(commitThresholdUsd({ wrongRepairCostUsd: 0, nextBestTestCostUsd: 25, tauFloor: 0.8 })).toBeNull();
        expect(commitThresholdUsd({ wrongRepairCostUsd: 100, nextBestTestCostUsd: -5, tauFloor: 0.8 })).toBeNull();
    });
});

describe('safetyBlocksRelease', () => {
    it('blocks at or above eps_safety, including 0.011 against 0.01', () => {
        expect(safetyBlocksRelease([0.011], 0.01)).toBe(true);
        expect(safetyBlocksRelease([0.01], 0.01)).toBe(true);
        expect(safetyBlocksRelease([0.009], 0.01)).toBe(false);
        expect(safetyBlocksRelease([0.005, 0.009], 0.01)).toBe(false);
        expect(safetyBlocksRelease([], 0.01)).toBe(false);
    });
});

describe('resolveThresholds', () => {
    it('falls back to the spec defaults and shared config hooks with no generated config', () => {
        expect(resolveThresholds(null)).toEqual({ tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 });
    });

    it('prefers the generated thresholds when present', () => {
        const config = {
            ...defaultCalibrationConfig(),
            thresholds: { tau_floor: 0.85, eps_safety: 0.005, other_escalate: 0.2 },
        };
        expect(resolveThresholds(config)).toEqual({ tauFloor: 0.85, epsSafety: 0.005, otherEscalate: 0.2 });
    });
});

describe('resolveCalibrationConfig', () => {
    it('falls back to identity when the file is missing or invalid', () => {
        for (const raw of [undefined, null, {}, { version: 2 }, 'not json']) {
            const resolved = resolveCalibrationConfig(raw);
            expect(resolved.source).toBe('fallback');
            expect(resolved.uncalibrated).toBe(true);
            expect(resolved.config.groups._pooled?.method).toBe('identity');
        }
    });

    it('loads a valid generated config', () => {
        const config = {
            ...defaultCalibrationConfig(),
            fitted_at: '2026-11-12T00:00:00Z',
            dataset_sha256: 'deadbeef',
            groups: { _pooled: { method: 'platt', a: 1.7, b: -0.6, n_fit: 96, n_holdout: 24 } },
        };
        const resolved = resolveCalibrationConfig(config);
        expect(resolved.source).toBe('generated');
        expect(resolved.uncalibrated).toBe(false);
        expect(resolved.config.thresholds.tau_floor).toBe(0.8);
    });
});

describe('subsystemGroupForHypothesisId', () => {
    it('classifies known bench rules and pools the rest', () => {
        expect(subsystemGroupForHypothesisId('brake-pads')).toBe('brakes_steering');
        expect(subsystemGroupForHypothesisId('misfire')).toBe('powertrain');
        expect(subsystemGroupForHypothesisId('alternator')).toBe('electrical');
        expect(subsystemGroupForHypothesisId('sunroof-drain')).toBe('body');
        expect(subsystemGroupForHypothesisId('some-unknown-cause')).toBe('_pooled');
    });
});

describe('tuneThresholds', () => {
    function holdoutCase(
        calibratedProbability: number,
        label: 0 | 1,
        overrides: Partial<{ safetyProbability: number; otherProbability: number; trueCauseSafetyCritical: boolean }> = {},
    ) {
        return {
            calibratedProbability,
            safetyProbability: 0.001,
            otherProbability: 0.05,
            label,
            trueCauseSafetyCritical: false,
            ...overrides,
        };
    }

    it('keeps the defaults when the holdout already meets the bar', () => {
        const holdout = Array.from({ length: 6 }, () => holdoutCase(0.95, 1));
        const candidates = [
            { tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 },
            { tauFloor: 0.9, epsSafety: 0.005, otherEscalate: 0.2 },
        ];
        expect(tuneThresholds(holdout, candidates)).toEqual(candidates[0]);
    });

    it('raises the floor when the holdout wrong-repair rate is over 5%', () => {
        const holdout = [
            ...Array.from({ length: 10 }, () => holdoutCase(0.82, 0)),
            ...Array.from({ length: 10 }, () => holdoutCase(0.82, 1)),
            ...Array.from({ length: 10 }, () => holdoutCase(0.95, 1)),
        ];
        // At τ 0.80: 10 wrong of 30 committed is 33% — over the bar.
        // At τ 0.90: only the 0.95 cases commit, all correct.
        const candidates = [
            { tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 },
            { tauFloor: 0.9, epsSafety: 0.01, otherEscalate: 0.25 },
        ];
        expect(tuneThresholds(holdout, candidates)).toEqual(candidates[1]);
    });

    it('returns null when no candidate meets the bar', () => {
        const holdout = Array.from({ length: 10 }, () => holdoutCase(0.99, 0));
        expect(
            tuneThresholds(holdout, [{ tauFloor: 0.8, epsSafety: 0.01, otherEscalate: 0.25 }]),
        ).toBeNull();
    });
});

describe('checkCalibrationGate', () => {
    function resolvedCase(overrides: Partial<ResolvedCase> = {}): ResolvedCase {
        return {
            caseId: 'case-1',
            suiteId: 'lemonade-bench',
            group: '_pooled',
            committedHypothesisId: 'misfire',
            trueHypothesisId: 'misfire',
            trueCauseSafetyCritical: false,
            trueCauseListed: true,
            rawProbability: 0.95,
            otherProbability: 0.02,
            safetyProbability: 0.001,
            label: 1,
            closedAt: '2026-11-01T00:00:00Z',
            ...overrides,
        };
    }

    function configFor(cases: ResolvedCase[], sha: string): GeneratedCalibrationConfig {
        return {
            ...defaultCalibrationConfig(),
            fitted_at: '2026-11-12T00:00:00Z',
            dataset_sha256: sha,
            groups: { _pooled: { method: 'identity', n_fit: cases.length, n_holdout: 1 } },
        };
    }

    it('passes a matching dataset with a calibrated holdout', () => {
        const cases = Array.from({ length: 10 }, (_, i) =>
            resolvedCase({
                caseId: `case-${i}`,
                closedAt: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
                rawProbability: 0.98,
                label: 1,
            }),
        );
        const sha = createHash('sha256').update(canonicalDatasetJson(cases)).digest('hex');
        expect(checkCalibrationGate({ cases, config: configFor(cases, sha), datasetSha256: sha })).toEqual([]);
    });

    it('fails when the dataset hash does not match', () => {
        const cases = [resolvedCase({ rawProbability: 0.98 })];
        const failures = checkCalibrationGate({
            cases,
            config: configFor(cases, 'stale-hash'),
            datasetSha256: 'current-hash',
        });
        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('dataset_sha256');
    });

    it('fails when pooled holdout ECE exceeds 0.05', () => {
        const cases = Array.from({ length: 10 }, (_, i) =>
            resolvedCase({
                caseId: `case-${i}`,
                closedAt: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
                rawProbability: 0.95,
                label: 0,
            }),
        );
        const sha = createHash('sha256').update(canonicalDatasetJson(cases)).digest('hex');
        const failures = checkCalibrationGate({ cases, config: configFor(cases, sha), datasetSha256: sha });
        expect(failures.some((failure) => failure.includes('ECE'))).toBe(true);
    });

    it('fails on an empty case set', () => {
        const failures = checkCalibrationGate({
            cases: [],
            config: configFor([], 'x'),
            datasetSha256: 'x',
        });
        expect(failures).toHaveLength(1);
    });

    it('splits the newest 20% by closed_at into the holdout', () => {
        const cases = Array.from({ length: 10 }, (_, i) =>
            resolvedCase({ caseId: `case-${i}`, closedAt: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
        );
        const { fit, holdout } = splitByClosedAt(cases);
        expect(fit).toHaveLength(8);
        expect(holdout.map((entry) => entry.caseId)).toEqual(['case-8', 'case-9']);
    });
});
