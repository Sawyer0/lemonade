import { describe, it, expect } from 'vitest';
import { FakeObdAdapter } from '../adapter';
import { ObdCaptureService } from '../ObdCaptureService';
import { evaluateGuidedTestSamples, runGuidedObdTest } from '../GuidedTestRunner';
import type { GuidedObdTestDefinition, ObdPidReading } from '../types';
import { FULL_SCAN_TRANSCRIPT } from './fixtures';

const HOLD_RPM_TEST: GuidedObdTestDefinition = {
    id: 'hold-2500-rpm',
    name: 'Hold 2,500 RPM',
    instruction: 'Hold 2,500 RPM steady for 30 s; log STFT/LTFT, O2, MAF.',
    durationSeconds: 30,
    pids: ['0C'],
    expectedRanges: [{ pid: '0C', min: 2400, max: 2600, unit: 'rpm' }],
};

function reading(pid: string, value: number, at = '2026-11-11T15:00:00.000Z'): ObdPidReading {
    return { pid, label: `PID ${pid}`, value, unit: 'rpm', capturedAt: at };
}

describe('evaluateGuidedTestSamples', () => {
    it('passes when every observed value stays inside its range', () => {
        const outcome = evaluateGuidedTestSamples(
            HOLD_RPM_TEST,
            [reading('0C', 2450), reading('0C', 2550), reading('0C', 2500)],
            '2026-11-11T15:00:00.000Z',
            '2026-11-11T15:00:30.000Z',
        );
        expect(outcome.result).toBe('pass');
        expect(outcome.checks).toEqual([
            {
                pid: '0C',
                label: 'PID 0C',
                unit: 'rpm',
                observedMin: 2450,
                observedMax: 2550,
                expectedMin: 2400,
                expectedMax: 2600,
                passed: true,
            },
        ]);
        expect(outcome.samplesRecorded).toBe(3);
    });

    it('fails when any observed value leaves its range', () => {
        const outcome = evaluateGuidedTestSamples(
            HOLD_RPM_TEST,
            [reading('0C', 2500), reading('0C', 3100)],
            '2026-11-11T15:00:00.000Z',
            '2026-11-11T15:00:30.000Z',
        );
        expect(outcome.result).toBe('fail');
        expect(outcome.checks[0]).toMatchObject({ observedMin: 2500, observedMax: 3100, passed: false });
    });

    it('is inconclusive when a ranged PID was never sampled', () => {
        const outcome = evaluateGuidedTestSamples(
            HOLD_RPM_TEST,
            [reading('0D', 0)],
            '2026-11-11T15:00:00.000Z',
            '2026-11-11T15:00:30.000Z',
        );
        expect(outcome.result).toBe('inconclusive');
        expect(outcome.checks[0]).toMatchObject({ observedMin: null, observedMax: null, passed: false });
    });

    it('fails one check while the other passes', () => {
        const twoPidTest: GuidedObdTestDefinition = {
            ...HOLD_RPM_TEST,
            pids: ['0C', '06'],
            expectedRanges: [
                { pid: '0C', min: 2400, max: 2600, unit: 'rpm' },
                { pid: '06', min: -5, max: 5, unit: '%' },
            ],
        };
        const outcome = evaluateGuidedTestSamples(
            twoPidTest,
            [reading('0C', 2500), { ...reading('06', 12), unit: '%' }],
            '2026-11-11T15:00:00.000Z',
            '2026-11-11T15:00:30.000Z',
        );
        expect(outcome.result).toBe('fail');
        expect(outcome.checks.map((check) => check.passed)).toEqual([true, false]);
    });
});

describe('runGuidedObdTest', () => {
    it('samples the adapter for the duration and returns pass against its range', async () => {
        const adapter = new FakeObdAdapter(FULL_SCAN_TRANSCRIPT);
        await adapter.connect();
        const capture = new ObdCaptureService(adapter, () => new Date('2026-11-11T15:00:00.000Z'));
        const shortTest: GuidedObdTestDefinition = { ...HOLD_RPM_TEST, durationSeconds: 3 };

        const outcome = await runGuidedObdTest(capture, shortTest, {
            sampleIntervalMs: 1000,
            delay: () => Promise.resolve(),
        });

        expect(outcome.result).toBe('pass');
        expect(outcome.samplesRecorded).toBe(3);
        expect(adapter.sentCommands.filter((command) => command === '01 0C')).toHaveLength(3);
    });
});
