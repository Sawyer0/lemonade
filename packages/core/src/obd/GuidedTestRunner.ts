// --- Guided OBD test runner (LM-03) ---
// LM-04 / LM-34 ask for a test ("hold 2,500 RPM 30 s; log STFT/LTFT, O2,
// MAF") and this runs it: sample the PIDs for the duration, then return
// pass or fail against the expected range, so the tech types nothing.
// `evaluateGuidedTestSamples` is pure, so the contract is testable without
// an adapter; `runGuidedObdTest` is the live orchestration over one.
import { pidLabel } from './elm327';
import type { ObdCaptureService } from './ObdCaptureService';
import {
    GuidedObdTestOutcomeSchema,
    type GuidedObdTestCheck,
    type GuidedObdTestDefinition,
    type GuidedObdTestOutcome,
    type ObdPidReading,
} from './types';

export interface GuidedTestRunOptions {
    /** Milliseconds between samples; 1 Hz by default. */
    sampleIntervalMs?: number;
    /** Injected for tests so a 30 s test does not take 30 s. Defaults to setTimeout. */
    delay?: (ms: number) => Promise<void>;
    now?: () => Date;
}

const DEFAULT_DELAY = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function checkForRange(
    definition: GuidedObdTestDefinition,
    range: GuidedObdTestDefinition['expectedRanges'][number],
    samples: readonly ObdPidReading[],
): GuidedObdTestCheck {
    const pidSamples = samples.filter((sample) => sample.pid === range.pid);
    const values = pidSamples.map((sample) => sample.value);
    const observedMin = values.length > 0 ? Math.min(...values) : null;
    const observedMax = values.length > 0 ? Math.max(...values) : null;
    // A PID with no samples at all cannot pass: the test is inconclusive
    // for that check, not a silent pass.
    const passed = observedMin !== null && observedMax !== null && observedMin >= range.min && observedMax <= range.max;
    const label = pidSamples[0]?.label ?? pidLabel(range.pid) ?? `PID ${range.pid}`;
    return {
        pid: range.pid,
        label,
        unit: range.unit,
        observedMin,
        observedMax,
        expectedMin: range.min,
        expectedMax: range.max,
        passed,
    };
}

/**
 * Evaluates recorded samples against a guided-test definition. The
 * outcome is fail when any check observed a value outside its range, pass
 * when every check stayed inside, and inconclusive when no check could be
 * evaluated (no samples for any ranged PID).
 */
export function evaluateGuidedTestSamples(
    definition: GuidedObdTestDefinition,
    samples: readonly ObdPidReading[],
    startedAt: string,
    endedAt: string,
): GuidedObdTestOutcome {
    const checks = definition.expectedRanges.map((range) => checkForRange(definition, range, samples));
    const evaluated = checks.filter((check) => check.observedMin !== null);
    const result = evaluated.length === 0 ? 'inconclusive' : checks.every((check) => check.passed) ? 'pass' : 'fail';
    return GuidedObdTestOutcomeSchema.parse({
        definitionId: definition.id,
        definitionName: definition.name,
        result,
        checks,
        samplesRecorded: samples.length,
        startedAt,
        endedAt,
    });
}

/**
 * Runs a guided test live: samples the definition's PIDs once per interval
 * for the whole duration, then evaluates. The adapter is sampled through
 * the capture service, so one transport serves scans and tests alike.
 */
export async function runGuidedObdTest(
    capture: ObdCaptureService,
    definition: GuidedObdTestDefinition,
    options: GuidedTestRunOptions = {},
): Promise<GuidedObdTestOutcome> {
    const sampleIntervalMs = options.sampleIntervalMs ?? 1000;
    const delay = options.delay ?? DEFAULT_DELAY;
    const now = options.now ?? (() => new Date());
    if (sampleIntervalMs <= 0) throw new Error('Guided test sample interval must be positive');
    const startedAt = now().toISOString();
    const samples: ObdPidReading[] = [];
    const sampleCount = Math.max(1, Math.floor((definition.durationSeconds * 1000) / sampleIntervalMs));
    for (let index = 0; index < sampleCount; index += 1) {
        samples.push(...(await capture.readLivePids(definition.pids)));
        if (index < sampleCount - 1) await delay(sampleIntervalMs);
    }
    return evaluateGuidedTestSamples(definition, samples, startedAt, now().toISOString());
}
