import { FakeObdAdapter, createEmulatorAdapter, type GuidedObdTestDefinition } from '@lemonade/core';
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
        const post = jest.fn().mockResolvedValue(okResponse());
        const capture = new MobileObdCapture(await connectedEmulator(), SESSION_ID, post);

        const window = await capture.captureFaultWindow('manual', 'tech said now');

        expect(window.trigger).toBe('manual');
        expect(post).toHaveBeenCalledWith(
            `/api/session/${SESSION_ID}/obd-event`,
            expect.objectContaining({ type: 'obd_fault_window', payload: window }),
        );
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
            const window = await capture.captureFaultWindow('manual');
            expect(window.samples.length).toBeGreaterThan(0);
        } finally {
            jest.useRealTimers();
        }
    });
});
