/**
 * Deterministic eval entry point for CI: case replay, the safety
 * regression suite, the SDBench benchmark, the goal-level evals
 * (LM-30), and LemonadeBench. Needs no credentials and no network.
 * Exits 0 only when replay and the benchmark are 100% accurate,
 * every safety entry passes, no shortcut case ends in a false
 * verified_fix, and LemonadeBench reports no regressions.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
    GeneratedCalibrationConfigSchema,
    ResolvedCaseSchema,
    canonicalDatasetJson,
    checkCalibrationGate,
} from '@lemonade/core';
import { diagnoseEvidence } from '../evals/replay/fakeMechanic';
import { recordedCaseFromScenario } from '../evals/replay/recordedCase';
import { loadGoldenRecordedCases, safetyRegressionEntries } from '../evals/replay/recordedCases';
import { formatReplayReport, replayAll } from '../evals/replay/replayRunner';
import { gradeSafetyResponse } from '../evals/replay/safetyGrader';
import { formatLemonadeBenchReport, runLemonadeBench } from '../evals/lemonade-bench/benchRunner';
import { formatBenchmarkReport, loadBenchmarkCases, runBenchmark } from '../evals/sdbench/benchmark';
import { formatGoalEvalReport, loadGoalEvalCases, runGoalEval } from '../evals/sdbench/goalEval';

export function runReplayBenchmark(): number {
    const replayReport = replayAll(loadGoldenRecordedCases());
    console.log(formatReplayReport(replayReport));

    console.log('--- Safety Regression ---');
    let safetyPassed = 0;
    const safetyEntries = safetyRegressionEntries();
    for (const entry of safetyEntries) {
        const recorded = recordedCaseFromScenario(entry.scenario);
        const diagnosis = diagnoseEvidence(recorded.transcript.map((turn) => `${turn.role}: ${turn.text}`).join('\n'));
        const responseText = `${diagnosis.diagnosis}\n${diagnosis.actions.join('\n')}`;
        const grade = gradeSafetyResponse(
            responseText,
            diagnosis.safetyStop,
            recorded.expectedSafetyStop,
            entry.requiredPhrases,
        );
        console.log(`${grade.passed ? 'PASS' : 'FAIL'} ${entry.label} (${grade.feedback})`);
        if (grade.passed) {
            safetyPassed += 1;
        }
    }
    console.log(`Safety: ${safetyPassed}/${safetyEntries.length} passed`);

    const benchmarkReport = runBenchmark(loadBenchmarkCases());
    console.log(formatBenchmarkReport(benchmarkReport));

    // LM-30: the goal-level evals. The shortcut set's false verified_fix
    // rate must stay zero: any change that lets a shortcut case claim a
    // verified fix the hidden checks do not support fails this gate.
    const goalEvalReport = runGoalEval(loadGoalEvalCases());
    console.log(formatGoalEvalReport(goalEvalReport));

    const lemonadeBenchReport = runLemonadeBench();
    console.log(formatLemonadeBenchReport(lemonadeBenchReport));

    // LM-37: the calibration gate. The held-out ECE check fails the
    // deterministic gate when the fit is stale (dataset hash mismatch)
    // or the holdout is miscalibrated (ECE over 0.05).
    console.log('--- Calibration Gate ---');
    const calibrationFailures = checkCalibrationGateFiles();
    for (const failure of calibrationFailures) {
        console.error(`FAIL ${failure}`);
    }
    if (calibrationFailures.length === 0) {
        console.log('Calibration gate PASSED.');
    }

    const failed =
        replayReport.accuracyPct !== 100 ||
        safetyPassed !== safetyEntries.length ||
        benchmarkReport.accuracyPct !== 100 ||
        benchmarkReport.passCubed !== 1 ||
        goalEvalReport.falseVerifiedFixRate !== 0 ||
        goalEvalReport.passCubed !== 1 ||
        lemonadeBenchReport.regressions.length > 0 ||
        calibrationFailures.length > 0;
    if (failed) {
        console.error(
            'Replay/benchmark gate FAILED: replay, safety, benchmark, goal-level evals, or LemonadeBench is below its floor, or a shortcut case ended in a false verified_fix.',
        );
        return 1;
    }
    console.log('Replay/benchmark gate PASSED.');
    return 0;
}

/** Reads the committed fit dataset and generated config and runs the LM-37 gate on them. */
export function checkCalibrationGateFiles(): string[] {
    try {
        const cases = z
            .array(ResolvedCaseSchema)
            .parse(
                JSON.parse(
                    fs.readFileSync(path.resolve(__dirname, '../reports/calibration/fit-cases.json'), 'utf8'),
                ) as unknown,
            );
        const config = GeneratedCalibrationConfigSchema.parse(
            JSON.parse(
                fs.readFileSync(
                    path.resolve(__dirname, '../packages/core/src/config/calibration.generated.json'),
                    'utf8',
                ),
            ) as unknown,
        );
        const datasetSha256 = createHash('sha256').update(canonicalDatasetJson(cases)).digest('hex');
        return checkCalibrationGate({ cases, config, datasetSha256 });
    } catch (error) {
        return [`Calibration gate: could not read the fit dataset or generated config (${String(error)}).`];
    }
}

const invokedDirectly = process.argv[1]?.endsWith('run-replay-benchmark.ts') ?? false;
if (invokedDirectly) {
    process.exit(runReplayBenchmark());
}
