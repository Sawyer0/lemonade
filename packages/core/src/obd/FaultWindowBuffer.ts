// --- Fault-window ring buffer (LM-03) ---
// Keeps a rolling window of live-PID samples. When the tech says "now", a
// code sets, or a value goes out of range, the window 60 s before to 15 s
// after the trigger is saved to the ledger as an `obd_fault_window` entry.
// Samples older than the buffer fall off; a trigger that arrives after its
// "before" samples have already fallen off still saves what is left, and
// says so in the window's start time.
import type { ObdFaultWindow, ObdPidReading } from './types';

export interface FaultWindowSample {
    pid: string;
    label: string;
    value: number;
    unit: string;
    /** Epoch milliseconds, from the same clock that dates the trigger. */
    capturedAtMs: number;
}

export interface OutOfRangeReading {
    pid: string;
    label: string;
    value: number;
    unit: string;
    expectedMin: number;
    expectedMax: number;
}

/** How far back the buffer reaches, and how far past the trigger a window runs. */
export const FAULT_WINDOW_BEFORE_MS = 60_000;
export const FAULT_WINDOW_AFTER_MS = 15_000;

function toReading(sample: FaultWindowSample): ObdPidReading {
    return {
        pid: sample.pid,
        label: sample.label,
        value: sample.value,
        unit: sample.unit,
        capturedAt: new Date(sample.capturedAtMs).toISOString(),
    };
}

export class FaultWindowBuffer {
    private readonly samples: FaultWindowSample[] = [];

    constructor(
        private readonly capacityMs: number = FAULT_WINDOW_BEFORE_MS + FAULT_WINDOW_AFTER_MS,
        private readonly nowMs: () => number = () => Date.now(),
    ) {
        if (capacityMs <= 0) throw new Error('FaultWindowBuffer capacity must be positive');
    }

    /** Records one live-PID sample, dropping anything older than the capacity. */
    public push(sample: FaultWindowSample): void {
        this.samples.push(sample);
        const cutoff = this.nowMs() - this.capacityMs;
        while (this.samples.length > 0 && (this.samples[0] as FaultWindowSample).capturedAtMs < cutoff) {
            this.samples.shift();
        }
    }

    public get size(): number {
        return this.samples.length;
    }

    /** Samples inside [startMs, endMs], oldest first. */
    public samplesInRange(startMs: number, endMs: number): FaultWindowSample[] {
        return this.samples.filter((sample) => sample.capturedAtMs >= startMs && sample.capturedAtMs <= endMs);
    }

    /**
     * The window around a trigger: 60 s before it to 15 s after it, from
     * whatever the buffer still holds. `startedAt` is the oldest sample
     * actually saved, so a reader can tell when the buffer had already
     * dropped the start of the window.
     */
    public windowAround(
        trigger: ObdFaultWindow['trigger'],
        triggerAtMs: number,
        triggerDetail?: string,
    ): ObdFaultWindow {
        const windowSamples = this.samplesInRange(
            triggerAtMs - FAULT_WINDOW_BEFORE_MS,
            triggerAtMs + FAULT_WINDOW_AFTER_MS,
        );
        const startedAtMs =
            windowSamples.length > 0
                ? (windowSamples[0] as FaultWindowSample).capturedAtMs
                : triggerAtMs - FAULT_WINDOW_BEFORE_MS;
        const endedAtMs =
            windowSamples.length > 0
                ? (windowSamples[windowSamples.length - 1] as FaultWindowSample).capturedAtMs
                : triggerAtMs + FAULT_WINDOW_AFTER_MS;
        return {
            trigger,
            ...(triggerDetail ? { triggerDetail } : {}),
            startedAt: new Date(startedAtMs).toISOString(),
            endedAt: new Date(endedAtMs).toISOString(),
            samples: windowSamples.map(toReading),
        };
    }
}

/**
 * Finds the first sample outside its expected range, if any. Ranges are
 * keyed by PID; a sample with no range is never out of range.
 */
export function findOutOfRange(
    samples: readonly FaultWindowSample[],
    ranges: Readonly<Record<string, { min: number; max: number }>>,
): OutOfRangeReading | null {
    for (const sample of samples) {
        const range = ranges[sample.pid];
        if (!range) continue;
        if (sample.value < range.min || sample.value > range.max) {
            return {
                pid: sample.pid,
                label: sample.label,
                value: sample.value,
                unit: sample.unit,
                expectedMin: range.min,
                expectedMax: range.max,
            };
        }
    }
    return null;
}
