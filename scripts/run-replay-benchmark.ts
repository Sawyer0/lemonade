/**
 * Deterministic eval entry point for CI: case replay, the safety
 * regression suite, and the SDBench benchmark. Needs no credentials and
 * no network. Exits 0 only when replay and the benchmark are 100%
 * accurate and every safety entry passes.
 */
import { diagnoseEvidence } from '../evals/replay/fakeMechanic';
import { recordedCaseFromScenario } from '../evals/replay/recordedCase';
import { loadGoldenRecordedCases, safetyRegressionEntries } from '../evals/replay/recordedCases';
import { formatReplayReport, replayAll } from '../evals/replay/replayRunner';
import { gradeSafetyResponse } from '../evals/replay/safetyGrader';
import { formatBenchmarkReport, loadBenchmarkCases, runBenchmark } from '../evals/sdbench/benchmark';

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

    const failed =
        replayReport.accuracyPct !== 100 ||
        safetyPassed !== safetyEntries.length ||
        benchmarkReport.accuracyPct !== 100 ||
        benchmarkReport.passCubed !== 1;
    if (failed) {
        console.error('Replay/benchmark gate FAILED: replay, safety, or benchmark is below 100%.');
        return 1;
    }
    console.log('Replay/benchmark gate PASSED.');
    return 0;
}

const invokedDirectly = process.argv[1]?.endsWith('run-replay-benchmark.ts') ?? false;
if (invokedDirectly) {
    process.exit(runReplayBenchmark());
}
