// Generated-config loader (LM-37): resolves the fit script's output
// into the config the stop rule reads. A missing or invalid file does
// not fail the build: it resolves to the identity map with the default
// thresholds and `uncalibrated: true`, exactly as the spec requires.
import generatedJson from '../../config/calibration.generated.json';
import { DEFAULT_TAU_FLOOR } from './thresholds';
import { GeneratedCalibrationConfigSchema, type GeneratedCalibrationConfig } from './types';

/** The fallback config: identity everywhere, default thresholds, no dataset. */
export function defaultCalibrationConfig(): GeneratedCalibrationConfig {
    return {
        version: 1,
        fitted_at: '',
        dataset_sha256: '',
        split: { holdout: 'newest_20pct_by_closed_at' },
        groups: {
            _pooled: { method: 'identity', n_fit: 0, n_holdout: 0 },
        },
        other_mass: { method: 'identity' },
        thresholds: {
            tau_floor: DEFAULT_TAU_FLOOR,
            eps_safety: 0.01,
            other_escalate: 0.25,
        },
    };
}

export interface ResolvedCalibration {
    config: GeneratedCalibrationConfig;
    /** True when no generated fit backs the numbers. */
    uncalibrated: boolean;
    source: 'generated' | 'fallback';
}

/**
 * Parses raw JSON (or undefined) into a resolved config. Anything that
 * does not match the schema — missing file, corrupt JSON, wrong shape —
 * is an error as a value: the identity fallback, never a throw.
 */
export function resolveCalibrationConfig(raw: unknown): ResolvedCalibration {
    const parsed = GeneratedCalibrationConfigSchema.safeParse(raw);
    if (!parsed.success) {
        return { config: defaultCalibrationConfig(), uncalibrated: true, source: 'fallback' };
    }
    const uncalibrated = Object.values(parsed.data.groups).every((group) => group.method === 'identity');
    return { config: parsed.data, uncalibrated, source: 'generated' };
}

/** The config the runtime reads: the generated file, resolved once. */
export const CALIBRATION_CONFIG: ResolvedCalibration = resolveCalibrationConfig(
    generatedJson as unknown,
);
