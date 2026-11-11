// --- Mobile OBD capture (LM-03) ---
// The session screen's OBD client: runs the core capture service over one
// adapter, keeps the rolling fault-window buffer fed from live PIDs, and
// posts every result to the case ledger through the session API routes.
// The adapter is injected, so the same client runs against a BLE OBDLink
// on a real car and against the emulator in development and tests.
import {
    FaultWindowBuffer,
    LIVE_SCAN_PIDS,
    ObdCaptureService,
    runGuidedObdTest,
    runVerifyFix,
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

type PostJson = (path: string, body: unknown) => Promise<Response>;

export class MobileObdCapture {
    private readonly capture: ObdCaptureService;
    private readonly faultBuffer = new FaultWindowBuffer();
    private samplingTimer: ReturnType<typeof setInterval> | null = null;
    private samplingInFlight = false;

    constructor(
        private readonly adapter: IObdAdapter,
        private readonly sessionId: string,
        private readonly post: PostJson = postJson,
    ) {
        this.capture = new ObdCaptureService(adapter);
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
            for (const reading of readings) {
                this.faultBuffer.push({ ...reading, capturedAtMs: Date.parse(reading.capturedAt) });
                onSample?.(reading);
            }
        } catch (error) {
            console.error('[MobileObdCapture] Live sample failed', error);
        } finally {
            this.samplingInFlight = false;
        }
    }

    /** Saves the 60 s-before / 15 s-after window around a trigger to the ledger. */
    public async captureFaultWindow(trigger: FaultWindowTrigger, triggerDetail?: string): Promise<ObdFaultWindow> {
        const window = this.faultBuffer.windowAround(trigger, Date.now(), triggerDetail);
        await this.postObdEvent('obd_fault_window', window);
        return window;
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
