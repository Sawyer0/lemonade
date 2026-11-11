// --- Mobile OBD capture (LM-03) ---
// The session screen's OBD client: runs the core capture service over one
// adapter, keeps the rolling fault-window buffer fed from live PIDs, and
// posts every result to the case ledger through the session API routes.
// The adapter is injected, so the same client runs against a BLE OBDLink
// on a real car and against the emulator in development and tests.
//
// Fault windows fire three ways: the tech taps "now" (manual), a stored
// code appears that was not there on the last poll (code-set), or a live
// PID leaves its plausibility range (out-of-range). Every trigger saves
// the 60 s before to 15 s after it — the capture waits out the 15 s after
// the trigger while sampling keeps running, so the saved window really
// holds samples on both sides.
import {
    FAULT_WINDOW_AFTER_MS,
    FAULT_WINDOW_BEFORE_MS,
    FaultWindowBuffer,
    LIVE_SCAN_PIDS,
    ObdCaptureService,
    assembleFaultWindow,
    findOutOfRange,
    runGuidedObdTest,
    runVerifyFix,
    type FaultWindowSample,
    type FaultWindowTrigger,
    type GuidedObdTestDefinition,
    type GuidedObdTestOutcome,
    type IObdAdapter,
    type ObdFaultWindow,
    type ObdPidReading,
    type ObdScanResult,
    type VerifyFixResult,
} from '@lemonade/core';
import { postJson } from './authorizedFetch';

// The one built-in guided test (LM-03): hold 2,500 RPM for 30 s and watch
// the fuel trims and the upstream O2 sensor. MAF is logged but has no
// expected range — it depends on the engine, so it cannot pass or fail.
export const HOLD_2500_RPM_TEST: GuidedObdTestDefinition = {
    id: 'hold-2500-rpm',
    name: 'Hold 2,500 RPM',
    instruction: 'Hold 2,500 RPM steady for 30 s; log STFT/LTFT, O2, MAF.',
    durationSeconds: 30,
    pids: ['0C', '06', '07', '14', '10'],
    expectedRanges: [
        { pid: '0C', min: 2400, max: 2600, unit: 'rpm' },
        { pid: '06', min: -10, max: 10, unit: '%' },
        { pid: '07', min: -10, max: 10, unit: '%' },
        { pid: '14', min: 0.1, max: 0.9, unit: 'V' },
    ],
};

/**
 * Plausibility bounds for the live-PID feed: a value outside them is a
 * sensor or car fault, not a diagnosis. These are deliberately wide — a
 * car at 7,000 RPM is at its redline, not past it — so the out-of-range
 * trigger fires on impossible readings, never on hard driving.
 */
export const DEFAULT_LIVE_PID_RANGES: Readonly<Record<string, { min: number; max: number }>> = {
    '05': { min: -40, max: 130 },
    '0C': { min: 0, max: 7000 },
    '0D': { min: 0, max: 250 },
    '11': { min: 0, max: 100 },
    '2F': { min: 0, max: 100 },
};

/** Minimum gap between two automatic fault-window captures. */
const AUTO_TRIGGER_COOLDOWN_MS = FAULT_WINDOW_BEFORE_MS;

export interface MobileObdCaptureOptions {
    /** Called with every fault window an automatic trigger saves. */
    onAutoFaultWindow?: (window: ObdFaultWindow) => void;
    /** Expected ranges for the out-of-range trigger; defaults to DEFAULT_LIVE_PID_RANGES. */
    livePidRanges?: Readonly<Record<string, { min: number; max: number }>>;
}

type PostJson = (path: string, body: unknown) => Promise<Response>;

export class MobileObdCapture {
    private readonly capture: ObdCaptureService;
    private readonly faultBuffer = new FaultWindowBuffer();
    private readonly livePidRanges: Readonly<Record<string, { min: number; max: number }>>;
    private readonly onAutoFaultWindow?: (window: ObdFaultWindow) => void;
    private samplingTimer: ReturnType<typeof setInterval> | null = null;
    private samplingInFlight = false;
    private knownCodes: ReadonlySet<string> | null = null;
    private autoCaptureInFlight: Promise<ObdFaultWindow> | null = null;
    private lastAutoTriggerAtMs = 0;

    constructor(
        private readonly adapter: IObdAdapter,
        private readonly sessionId: string,
        private readonly post: PostJson = postJson,
        options: MobileObdCaptureOptions = {},
    ) {
        this.capture = new ObdCaptureService(adapter);
        this.livePidRanges = options.livePidRanges ?? DEFAULT_LIVE_PID_RANGES;
        this.onAutoFaultWindow = options.onAutoFaultWindow;
    }

    public get isConnected(): boolean {
        return this.adapter.isConnected;
    }

    public get adapterName(): string {
        return this.adapter.adapterInfo.name;
    }

    /** Connects the adapter and proves the bus answers. */
    public async connectAndInitialize(): Promise<void> {
        await this.adapter.connect();
        await this.capture.initialize();
        // A fresh baseline per connection: codes already set when the tech
        // plugs in are the car's state, not a new fault.
        this.knownCodes = null;
    }

    public async disconnect(): Promise<void> {
        this.stopLiveSampling();
        await this.adapter.disconnect();
    }

    /**
     * The one-tap scan: reads every mode from the car and records it in the
     * ledger. Returns the scan so the panel can render it.
     */
    public async scanAndRecord(): Promise<ObdScanResult> {
        const scan = await this.capture.captureFullScan();
        const response = await this.post(`/api/session/${this.sessionId}/obd-scan`, scan);
        if (!response.ok) {
            throw new Error(`OBD scan was not recorded (HTTP ${response.status})`);
        }
        return scan;
    }

    /** Starts the 1 Hz live-PID feed that fills the fault-window buffer. */
    public startLiveSampling(onSample?: (reading: ObdPidReading) => void, intervalMs: number = 1000): void {
        if (this.samplingTimer) return;
        this.samplingTimer = setInterval(() => {
            void this.sampleOnce(onSample);
        }, intervalMs);
    }

    public stopLiveSampling(): void {
        if (this.samplingTimer) {
            clearInterval(this.samplingTimer);
            this.samplingTimer = null;
        }
    }

    private async sampleOnce(onSample?: (reading: ObdPidReading) => void): Promise<void> {
        // The link is serial: never start a read while one is in flight.
        if (this.samplingInFlight) return;
        this.samplingInFlight = true;
        try {
            const readings = await this.capture.readLivePids(LIVE_SCAN_PIDS);
            const samples: FaultWindowSample[] = readings.map((reading) => ({
                ...reading,
                capturedAtMs: Date.parse(reading.capturedAt),
            }));
            for (const sample of samples) {
                this.faultBuffer.push(sample);
            }
            for (const reading of readings) {
                onSample?.(reading);
            }
            const outOfRange = findOutOfRange(samples, this.livePidRanges);
            if (outOfRange) {
                this.fireAutoTrigger(
                    'out-of-range',
                    `${outOfRange.label} ${outOfRange.value}${outOfRange.unit} outside ` +
                        `${outOfRange.expectedMin}..${outOfRange.expectedMax}${outOfRange.unit}`,
                );
            }
            await this.checkStoredCodes();
        } catch (error) {
            console.error('[MobileObdCapture] Live sample failed', error);
        } finally {
            this.samplingInFlight = false;
        }
    }

    /**
     * Polls stored codes: a code that was not there on the last poll sets
     * the code-set trigger. The first poll after connecting only sets the
     * baseline — codes already stored are the car's state, not a new fault.
     */
    private async checkStoredCodes(): Promise<void> {
        let codes: string[];
        try {
            codes = await this.capture.readStoredCodes();
        } catch (error) {
            // A poll that cannot reach the car is not a new code; leave the
            // baseline alone so the next poll still compares against it.
            console.error('[MobileObdCapture] Stored-code poll failed', error);
            return;
        }
        const known = this.knownCodes;
        if (!known) {
            this.knownCodes = new Set(codes);
            return;
        }
        const fresh = codes.filter((code) => !known.has(code));
        if (fresh.length > 0) {
            this.knownCodes = new Set(codes);
            this.fireAutoTrigger('code-set', `New code set: ${fresh.join(', ')}`);
        }
    }

    /**
     * Fires an automatic trigger without blocking the sampler: the capture
     * runs in the background and reports through onAutoFaultWindow. One
     * automatic window at a time, and at most one a minute — a value that
     * stays out of range must not save a window every second, and
     * overlapping 60 s windows would mostly duplicate each other.
     */
    private fireAutoTrigger(trigger: FaultWindowTrigger, triggerDetail: string): void {
        const nowMs = Date.now();
        if (this.autoCaptureInFlight || nowMs - this.lastAutoTriggerAtMs < AUTO_TRIGGER_COOLDOWN_MS) return;
        this.lastAutoTriggerAtMs = nowMs;
        const pending = this.captureFaultWindow(trigger, triggerDetail);
        this.autoCaptureInFlight = pending;
        void pending
            .then((window) => {
                this.onAutoFaultWindow?.(window);
            })
            .catch((error) => {
                console.error('[MobileObdCapture] Automatic fault window was not saved', error);
            })
            .finally(() => {
                if (this.autoCaptureInFlight === pending) this.autoCaptureInFlight = null;
            });
    }

    /**
     * Saves the 60 s-before / 15 s-after window around a trigger to the
     * ledger. The before-trigger samples are frozen at trigger time, then
     * the capture waits the 15 s after the trigger while live sampling
     * keeps running, and only then saves: snapshotting immediately would
     * save 60 s before to ~0 s after, because the buffer cannot hold
     * samples from the future yet. Freezing matters because the buffer's
     * capacity is exactly 60 s + 15 s — a sample pushed after the wait
     * could prune the window's first sample before a late snapshot read it.
     */
    public async captureFaultWindow(trigger: FaultWindowTrigger, triggerDetail?: string): Promise<ObdFaultWindow> {
        const triggerAtMs = Date.now();
        const beforeSamples = this.faultBuffer.samplesInRange(triggerAtMs - FAULT_WINDOW_BEFORE_MS, triggerAtMs);
        await this.sleep(FAULT_WINDOW_AFTER_MS);
        const afterSamples = this.faultBuffer.samplesInRange(triggerAtMs, triggerAtMs + FAULT_WINDOW_AFTER_MS);
        const seen = new Set(beforeSamples.map((sample) => `${sample.pid}:${sample.capturedAtMs}`));
        const samples = [
            ...beforeSamples,
            ...afterSamples.filter((sample) => !seen.has(`${sample.pid}:${sample.capturedAtMs}`)),
        ];
        const window = assembleFaultWindow(trigger, triggerAtMs, samples, triggerDetail);
        await this.postObdEvent('obd_fault_window', window);
        return window;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    /** Runs a guided test live and records its pass/fail outcome in the ledger. */
    public async runGuidedTest(definition: GuidedObdTestDefinition): Promise<GuidedObdTestOutcome> {
        const outcome = await runGuidedObdTest(this.capture, definition);
        await this.postObdEvent('guided_test', outcome);
        return outcome;
    }

    /**
     * Runs verify-fix: clears the codes, rescans, and records both the
     * rescan and the verdict. The caller confirms the drive cycle ran.
     */
    public async runVerifyFix(
        driveCycleCompleted: boolean,
    ): Promise<{ result: VerifyFixResult; rescan: ObdScanResult }> {
        const { result, rescan } = await runVerifyFix(this.capture, driveCycleCompleted);
        const scanResponse = await this.post(`/api/session/${this.sessionId}/obd-scan`, rescan);
        if (!scanResponse.ok) {
            throw new Error(`Verify-fix rescan was not recorded (HTTP ${scanResponse.status})`);
        }
        await this.postObdEvent('verify_fix', result);
        return { result, rescan };
    }

    private async postObdEvent(
        type: 'guided_test' | 'obd_fault_window' | 'verify_fix',
        payload: unknown,
    ): Promise<void> {
        const response = await this.post(`/api/session/${this.sessionId}/obd-event`, { type, payload });
        if (!response.ok) {
            throw new Error(`OBD ${type} event was not recorded (HTTP ${response.status})`);
        }
    }
}
