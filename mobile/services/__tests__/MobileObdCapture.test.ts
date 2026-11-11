import {
    EMULATOR_ADAPTER_INFO,
    FULL_SCAN_TRANSCRIPT,
    FakeObdAdapter,
    createEmulatorAdapter,
    type GuidedObdTestDefinition,
    type IObdAdapter,
} from '@lemonade/core';
import { HOLD_2500_RPM_TEST, MobileObdCapture } from '../MobileObdCapture';

jest.mock('../../infrastructure/firebase/config', () => ({
    auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('id-token') } },
    db: {},
}));
jest.mock('../../constants/config', () => ({ CONFIG: { API: { BASE_URL: 'https://api.test' } } }));

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';

function okResponse(): Response {
    return { ok: true, status: 200 } as Response;
}

async function connectedEmulator(): Promise<FakeObdAdapter> {
    const adapter = createEmulatorAdapter();
    await adapter.connect();
    return adapter;
}

// Live PIDs with the engine at 8,000 RPM: outside the 0..7,000 plausibility
// range, so the out-of-range trigger must fire.
const HIGH_RPM_TRANSCRIPT = {
    ...FULL_SCAN_TRANSCRIPT,
    '01 05 0C 0D 11 2F': '41 05 82 0C 7D 00 0D 00 11 26 2F 80\r\r>',
};

/** An adapter whose stored codes change: none on the first Mode 03 poll, P0300 after. */
class ChangingCodesAdapter implements IObdAdapter {
    public readonly adapterInfo = EMULATOR_ADAPTER_INFO;
    private readonly inner = new FakeObdAdapter(FULL_SCAN_TRANSCRIPT);
    private codePolls = 0;

    public get isConnected(): boolean {
        return this.inner.isConnected;
    }

    public connect(): Promise<void> {
        return this.inner.connect();
    }

    public disconnect(): Promise<void> {
        return this.inner.disconnect();
    }

    public async sendCommand(command: string): Promise<string> {
        if (command.trim() === '03') {
            this.codePolls += 1;
            return this.codePolls === 1 ? '43 00 00\r\r>' : '43 03 00\r\r>';
        }
        return this.inner.sendCommand(command);
    }
}

describe('MobileObdCapture', () => {
    it('scans the car and posts the scan to the session API', async () => {
        const post = jest.fn().mockResolvedValue(okResponse());
        const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);

        const scan = await capture.scanAndRecord();

        expect(scan.storedCodes).toEqual(['P0300', 'P0420']);
        expect(scan.vin).toBe('1HGCM82633A004352');
        expect(post).toHaveBeenCalledWith(`/api/session/${SESSION_ID}/obd-scan`, scan);
    });

    it('fails the scan instead of posting when the adapter cannot reach the car', async () => {
        const post = jest.fn().mockResolvedValue(okResponse());
        const adapter = new FakeObdAdapter({ '0100': 'UNABLE TO CONNECT\r\r>' });
        await adapter.connect();
        const capture = new MobileObdCapture(adapter, SESSION_ID, post);

        await expect(capture.scanAndRecord()).rejects.toThrow();
        expect(post).not.toHaveBeenCalled();
    });

    it('refuses to post a scan the API rejects', async () => {
        const post = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
        const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);

        await expect(capture.scanAndRecord()).rejects.toThrow('HTTP 403');
    });

    it('runs a guided test and posts its outcome', async () => {
        const post = jest.fn().mockResolvedValue(okResponse());
        const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);
        const shortTest: GuidedObdTestDefinition = { ...HOLD_2500_RPM_TEST, durationSeconds: 1 };

        const outcome = await capture.runGuidedTest(shortTest);

        expect(outcome.result).toBe('pass');
        expect(post).toHaveBeenCalledWith(
            `/api/session/${SESSION_ID}/obd-event`,
            expect.objectContaining({ type: 'guided_test', payload: outcome }),
        );
    });

    it('saves a fault window to the ledger', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);

            // A fault window waits out the 15 s after the trigger before it
            // saves, so the test drives the clock through the wait.
            const pending = capture.captureFaultWindow('manual', 'tech said now');
            await jest.advanceTimersByTimeAsync(15000);
            const window = await pending;

            expect(window.trigger).toBe('manual');
            expect(post).toHaveBeenCalledWith(
                `/api/session/${SESSION_ID}/obd-event`,
                expect.objectContaining({ type: 'obd_fault_window', payload: window }),
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('runs verify-fix, posts the rescan and the verdict', async () => {
        const post = jest.fn().mockResolvedValue(okResponse());
        const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);

        const { result, rescan } = await capture.runVerifyFix(true);

        expect(result.passed).toBe(false);
        expect(result.returnedStoredCodes).toEqual(['P0300', 'P0420']);
        expect(rescan.storedCodes).toEqual(['P0300', 'P0420']);
        expect(post).toHaveBeenCalledWith(`/api/session/${SESSION_ID}/obd-scan`, rescan);
        expect(post).toHaveBeenCalledWith(
            `/api/session/${SESSION_ID}/obd-event`,
            expect.objectContaining({ type: 'verify_fix', payload: result }),
        );
    });

    it('samples live PIDs into the fault window', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);
            const seen: string[] = [];
            capture.startLiveSampling((reading) => {
                seen.push(reading.pid);
            });

            await jest.advanceTimersByTimeAsync(2500);

            expect(seen).toContain('0C');
            capture.stopLiveSampling();
            const pending = capture.captureFaultWindow('manual');
            await jest.advanceTimersByTimeAsync(15000);
            const window = await pending;
            expect(window.samples.length).toBeGreaterThan(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it('captures samples from both sides of the trigger', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);
            capture.startLiveSampling();

            await jest.advanceTimersByTimeAsync(2500);
            const triggerAtMs = Date.now();
            const pending = capture.captureFaultWindow('manual', 'tech said now');
            await jest.advanceTimersByTimeAsync(15000);
            const window = await pending;
            capture.stopLiveSampling();

            // The window holds the 15 s after the trigger, not just the
            // 60 s before it: samples land on both sides of the trigger.
            const capturedAt = window.samples.map((sample) => Date.parse(sample.capturedAt));
            expect(capturedAt.some((at) => at < triggerAtMs)).toBe(true);
            expect(capturedAt.some((at) => at > triggerAtMs)).toBe(true);
            expect(window.startedAt).toBe(new Date(capturedAt[0] as number).toISOString());
            expect(Date.parse(window.endedAt)).toBeGreaterThanOrEqual(triggerAtMs + 14_000);
        } finally {
            jest.useRealTimers();
        }
    });

    it('keeps the 60 s of samples before a trigger when the snapshot lands 15 s later', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);
            capture.startLiveSampling();

            await jest.advanceTimersByTimeAsync(61_000);
            const triggerAtMs = Date.now();
            const pending = capture.captureFaultWindow('manual');
            await jest.advanceTimersByTimeAsync(15_000);
            const window = await pending;
            capture.stopLiveSampling();

            // The before-trigger samples are frozen at trigger time, so the
            // sample at the 60 s mark survives the snapshot landing 15 s
            // later, on the buffer's pruning edge.
            expect(window.samples.length).toBeGreaterThan(0);
            expect(window.startedAt).toBe(new Date(triggerAtMs - 60_000).toISOString());
            expect(window.samples[0]?.capturedAt).toBe(new Date(triggerAtMs - 60_000).toISOString());
            expect(Date.parse(window.endedAt)).toBeGreaterThanOrEqual(triggerAtMs + 14_000);
            expect(post).toHaveBeenCalledWith(
                `/api/session/${SESSION_ID}/obd-event`,
                expect.objectContaining({ type: 'obd_fault_window', payload: window }),
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('saves a fault window when a live PID goes out of range', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const onAutoFaultWindow = jest.fn();
            const adapter = new FakeObdAdapter(HIGH_RPM_TRANSCRIPT);
            await adapter.connect();
            const capture = new MobileObdCapture(adapter, SESSION_ID, post, { onAutoFaultWindow });
            capture.startLiveSampling();

            // The first sample trips the trigger; the capture waits 15 s
            // and then posts. One window, not one per second.
            await jest.advanceTimersByTimeAsync(20_000);
            capture.stopLiveSampling();

            expect(post).toHaveBeenCalledTimes(1);
            expect(post).toHaveBeenCalledWith(
                `/api/session/${SESSION_ID}/obd-event`,
                expect.objectContaining({
                    type: 'obd_fault_window',
                    payload: expect.objectContaining({ trigger: 'out-of-range' }),
                }),
            );
            const posted = post.mock.calls[0]?.[1] as { payload: { triggerDetail?: string } };
            expect(posted.payload.triggerDetail).toMatch(/8000/);
            expect(onAutoFaultWindow).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'out-of-range' }));
        } finally {
            jest.useRealTimers();
        }
    });

    it('saves a fault window when a new code sets', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const adapter = new ChangingCodesAdapter();
            await adapter.connect();
            const capture = new MobileObdCapture(adapter, SESSION_ID, post);
            capture.startLiveSampling();

            // First poll baselines no codes; the second poll sees P0300
            // set, trips the trigger, and the window posts after 15 s.
            await jest.advanceTimersByTimeAsync(20_000);
            capture.stopLiveSampling();

            expect(post).toHaveBeenCalledTimes(1);
            expect(post).toHaveBeenCalledWith(
                `/api/session/${SESSION_ID}/obd-event`,
                expect.objectContaining({
                    type: 'obd_fault_window',
                    payload: expect.objectContaining({
                        trigger: 'code-set',
                        triggerDetail: 'New code set: P0300',
                    }),
                }),
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not treat codes already stored at connect time as a new fault', async () => {
        jest.useFakeTimers();
        try {
            const post = jest.fn().mockResolvedValue(okResponse());
            const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);
            capture.startLiveSampling();

            await jest.advanceTimersByTimeAsync(5000);
            capture.stopLiveSampling();

            // The emulator always reports P0300 + P0420; they were already
            // stored when sampling started, so no code-set window fires.
            expect(post).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
