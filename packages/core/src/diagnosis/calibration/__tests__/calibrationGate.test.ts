// Calibration CI gate (LM-37): the held-out ECE check, run in CI as
// part of `npm run test:coverage`.
//
// It reads the committed fit dataset (reports/calibration/fit-cases.json)
// and the generated config, recomputes the dataset hash, and fails when
// the hash does not match (the fit is stale) or when the holdout ECE
// exceeds 0.05 pooled or per group with n_holdout ≥ 30. A stale fit
// fails here until the fit script re-runs; nothing here re-fits.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    GeneratedCalibrationConfigSchema,
    ResolvedCaseSchema,
    canonicalDatasetJson,
    checkCalibrationGate,
    resolveCalibrationConfig,
} from '../index';

const FIT_CASES_PATH = path.resolve(process.cwd(), 'reports/calibration/fit-cases.json');
const GENERATED_CONFIG_PATH = path.resolve(
    process.cwd(),
    'packages/core/src/config/calibration.generated.json',
);

describe('calibration CI gate', () => {
    it('passes on the committed fit: hash matches and holdout ECE is within 0.05', () => {
        const cases = z.array(ResolvedCaseSchema).parse(JSON.parse(readFileSync(FIT_CASES_PATH, 'utf8')) as unknown);
        const config = GeneratedCalibrationConfigSchema.parse(
            JSON.parse(readFileSync(GENERATED_CONFIG_PATH, 'utf8')) as unknown,
        );
        const datasetSha256 = createHash('sha256').update(canonicalDatasetJson(cases)).digest('hex');
        expect(config.dataset_sha256).toBe(datasetSha256);
        expect(checkCalibrationGate({ cases, config, datasetSha256 })).toEqual([]);
    });

    it('loads the committed generated config as a real (if identity) fit', () => {
        const raw = JSON.parse(readFileSync(GENERATED_CONFIG_PATH, 'utf8')) as unknown;
        const resolved = resolveCalibrationConfig(raw);
        expect(resolved.source).toBe('generated');
        // 30 LemonadeBench replays cannot support a slope yet: identity
        // with uncalibrated true is the spec's method-by-size outcome.
        expect(resolved.uncalibrated).toBe(true);
        expect(resolved.config.thresholds).toEqual({ tau_floor: 0.8, eps_safety: 0.01, other_escalate: 0.25 });
    });
});
