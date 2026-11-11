import { describe, it, expect } from 'vitest';
import {
    FAULT_WINDOW_AFTER_MS,
    FAULT_WINDOW_BEFORE_MS,
    FaultWindowBuffer,
    findOutOfRange,
    type FaultWindowSample,
} from '../FaultWindowBuffer';

const START_MS = Date.parse('2026-11-11T15:00:00.000Z');

function rpmSample(atMs: number, value = 2500): FaultWindowSample {
    return { pid: '0C', label: 'Engine RPM', value, unit: 'rpm', capturedAtMs: atMs };
}

describe('FaultWindowBuffer', () => {
    it('saves 60 s before to 15 s after the trigger', () => {
        // Capacity covers the whole recording, so the ideal window survives.
        let nowMs = START_MS + 120_000;
        const buffer = new FaultWindowBuffer(130_000, () => nowMs);
        for (let second = 0; second <= 120; second += 1) {
            nowMs = START_MS + second * 1000;
            buffer.push(rpmSample(START_MS + second * 1000));
        }

        const triggerAtMs = START_MS + 90_000;
        const window = buffer.windowAround('manual', triggerAtMs, 'tech said now');

        expect(window.trigger).toBe('manual');
        expect(window.triggerDetail).toBe('tech said now');
        expect(window.startedAt).toBe(new Date(START_MS + 30_000).toISOString());
        expect(window.endedAt).toBe(new Date(START_MS + 105_000).toISOString());
        expect(window.samples).toHaveLength(76);
        expect(window.samples[0]?.capturedAt).toBe(new Date(START_MS + 30_000).toISOString());
        expect(window.samples[window.samples.length - 1]?.capturedAt).toBe(
            new Date(START_MS + 105_000).toISOString(),
        );
    });

    it('drops samples older than the capacity', () => {
        let nowMs = START_MS;
        const buffer = new FaultWindowBuffer(FAULT_WINDOW_BEFORE_MS + FAULT_WINDOW_AFTER_MS, () => nowMs);
        nowMs = START_MS;
        buffer.push(rpmSample(START_MS));
        nowMs = START_MS + 76_000;
        buffer.push(rpmSample(START_MS + 76_000));

        expect(buffer.size).toBe(1);
        expect(buffer.samplesInRange(START_MS, START_MS + 76_000)).toHaveLength(1);
    });

    it('reports the window it actually saved when the start already fell off', () => {
        let nowMs = START_MS + 120_000;
        const buffer = new FaultWindowBuffer(FAULT_WINDOW_BEFORE_MS + FAULT_WINDOW_AFTER_MS, () => nowMs);
        for (let second = 60; second <= 120; second += 1) {
            nowMs = START_MS + second * 1000;
            buffer.push(rpmSample(START_MS + second * 1000));
        }

        const window = buffer.windowAround('code-set', START_MS + 90_000, 'P0300 set');

        // The buffer only ever held 60 s back, so the window starts at the
        // oldest sample it has, not at the ideal 60 s mark.
        expect(window.startedAt).toBe(new Date(START_MS + 60_000).toISOString());
        expect(window.samples).toHaveLength(46);
    });
});

describe('findOutOfRange', () => {
    it('finds the first sample outside its range', () => {
        const found = findOutOfRange(
            [rpmSample(START_MS, 2500), rpmSample(START_MS + 1000, 4200)],
            { '0C': { min: 2400, max: 2600 } },
        );
        expect(found).toMatchObject({ pid: '0C', value: 4200, expectedMin: 2400, expectedMax: 2600 });
    });

    it('ignores samples with no range and in-range values', () => {
        expect(
            findOutOfRange([rpmSample(START_MS, 2500)], { '0C': { min: 2400, max: 2600 } }),
        ).toBeNull();
        expect(findOutOfRange([rpmSample(START_MS, 9000)], {})).toBeNull();
    });
});
