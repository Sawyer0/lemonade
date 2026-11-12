// Calibration fits (LM-37): isotonic, Platt, and identity, chosen per
// group by sample size — isotonic at n ≥ 200, Platt at 30 ≤ n < 200,
// identity below 30. All pure and deterministic: no clock, no I/O, no
// randomness, so the fit script and the CI gate agree exactly.
import type { CalibrationMap, CalibrationMethod, FitPoint, GeneratedCalibrationConfig, SubsystemGroup } from './types';

export const ISOTONIC_MIN_N = 200;
export const PLATT_MIN_N = 30;

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function logit(p: number): number {
    const clipped = Math.max(0.001, Math.min(0.999, p));
    return Math.log(clipped / (1 - clipped));
}

function sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/**
 * Isotonic regression by pool-adjacent-violators, on the sorted points.
 * The map is the fitted step function as knots: each run of one fitted
 * value contributes its last x, with (0, first) and (1, last) endpoints
 * so the map covers the whole range. Apply interpolates linearly
 * between knots, which is the spec's `{x, y}` map shape.
 */
export function fitIsotonic(points: FitPoint[]): CalibrationMap {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    interface Block {
        sum: number;
        count: number;
        lastX: number;
    }
    const blocks: Block[] = [];
    for (const point of sorted) {
        blocks.push({ sum: point.label, count: 1, lastX: point.x });
        while (blocks.length >= 2) {
            const right = blocks[blocks.length - 1];
            const left = blocks[blocks.length - 2];
            if (left === undefined || right === undefined) break;
            if (left.sum / left.count <= right.sum / right.count) break;
            blocks.pop();
            blocks.pop();
            blocks.push({ sum: left.sum + right.sum, count: left.count + right.count, lastX: right.lastX });
        }
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (const block of blocks) {
        const value = clamp01(block.sum / block.count);
        if (xs.length === 0 && block.lastX > 0) {
            xs.push(0);
            ys.push(value);
        }
        xs.push(block.lastX);
        ys.push(value);
    }
    if (xs[xs.length - 1] !== 1) {
        xs.push(1);
        ys.push(ys[ys.length - 1] ?? 0);
    }
    return { method: 'isotonic', map: { x: xs, y: ys } };
}

/** Mean log-loss of a Platt map on the points, for the grid search. */
function plattLoss(points: FitPoint[], a: number, b: number): number {
    let total = 0;
    for (const point of points) {
        const p = sigmoid(a * logit(point.x) + b);
        total -= point.label === 1 ? Math.log(Math.max(1e-9, p)) : Math.log(Math.max(1e-9, 1 - p));
    }
    return total / Math.max(1, points.length);
}

/**
 * Platt scaling by deterministic coarse-to-fine grid search over
 * (a, b), minimising log-loss. A grid cannot diverge the way gradient
 * descent can on degenerate data, and the same points always give the
 * same (a, b).
 */
export function fitPlatt(points: FitPoint[]): CalibrationMap {
    let bestA = 1;
    let bestB = 0;
    let bestLoss = plattLoss(points, bestA, bestB);
    let stepA = 0.25;
    let stepB = 0.25;
    let lowA = 0.1;
    let highA = 5;
    let lowB = -3;
    let highB = 3;
    for (let round = 0; round < 3; round += 1) {
        for (let a = lowA; a <= highA + 1e-9; a += stepA) {
            for (let b = lowB; b <= highB + 1e-9; b += stepB) {
                const loss = plattLoss(points, a, b);
                if (loss < bestLoss) {
                    bestLoss = loss;
                    bestA = a;
                    bestB = b;
                }
            }
        }
        lowA = Math.max(0.1, bestA - stepA);
        highA = bestA + stepA;
        lowB = bestB - stepB;
        highB = bestB + stepB;
        stepA /= 5;
        stepB /= 5;
    }
    return { method: 'platt', a: Math.round(bestA * 10000) / 10000, b: Math.round(bestB * 10000) / 10000 };
}

/** The identity map: the raw posterior passes through unchanged. */
export function fitIdentity(): CalibrationMap {
    return { method: 'identity' };
}

/** A fit is degenerate when the labels or the inputs carry no signal to fit. */
export function isDegenerateFit(points: FitPoint[]): boolean {
    if (points.length === 0) return true;
    const labels = new Set(points.map((point) => point.label));
    const xs = new Set(points.map((point) => point.x));
    return labels.size < 2 || xs.size < 2;
}

/**
 * The spec's method by sample size, with the degenerate guard: a group
 * whose labels are all one value, or whose posteriors never vary,
 * cannot support a slope, so it falls back to identity.
 */
export function fitGroupCalibration(points: FitPoint[]): CalibrationMap {
    if (points.length < PLATT_MIN_N || isDegenerateFit(points)) return fitIdentity();
    if (points.length >= ISOTONIC_MIN_N) return fitIsotonic(points);
    return fitPlatt(points);
}

/** Applies one fitted map to a raw posterior. */
export function applyCalibrationMap(map: CalibrationMap, raw: number): number {
    const p = clamp01(raw);
    if (map.method === 'identity') return p;
    if (map.method === 'platt') {
        return clamp01(sigmoid((map.a ?? 1) * logit(p) + (map.b ?? 0)));
    }
    const knots = map.map;
    if (knots === undefined || knots.x.length === 0) return p;
    if (p <= knots.x[0]!) return clamp01(knots.y[0]!);
    for (let i = 1; i < knots.x.length; i += 1) {
        const x0 = knots.x[i - 1]!;
        const x1 = knots.x[i]!;
        if (p <= x1) {
            const y0 = knots.y[i - 1]!;
            const y1 = knots.y[i]!;
            if (x1 === x0) return clamp01(y1);
            return clamp01(y0 + ((p - x0) / (x1 - x0)) * (y1 - y0));
        }
    }
    return clamp01(knots.y[knots.y.length - 1]!);
}

/**
 * Calibrates one raw posterior with the group's map, falling back to
 * `_pooled` and then to identity. Identity results carry
 * `uncalibrated: true`: no fit backs the number.
 */
export function calibrateProbability(
    raw: number,
    group: SubsystemGroup,
    config: GeneratedCalibrationConfig | null,
): { calibrated: number; method: CalibrationMethod; uncalibrated: boolean; group: SubsystemGroup } {
    const groupMap = config?.groups[group];
    const pooledMap = config?.groups._pooled;
    const map = groupMap ?? pooledMap;
    if (map === undefined) {
        return { calibrated: clamp01(raw), method: 'identity', uncalibrated: true, group: '_pooled' };
    }
    const usedGroup = groupMap !== undefined ? group : '_pooled';
    return {
        calibrated: applyCalibrationMap(map, raw),
        method: map.method,
        uncalibrated: map.method === 'identity',
        group: usedGroup,
    };
}

/** Calibrates the OTHER mass with the config's dedicated map. */
export function calibrateOtherMass(
    raw: number,
    config: GeneratedCalibrationConfig | null,
): { calibrated: number; method: CalibrationMethod; uncalibrated: boolean } {
    if (config === null) {
        return { calibrated: clamp01(raw), method: 'identity', uncalibrated: true };
    }
    return {
        calibrated: applyCalibrationMap(config.other_mass, raw),
        method: config.other_mass.method,
        uncalibrated: config.other_mass.method === 'identity',
    };
}
