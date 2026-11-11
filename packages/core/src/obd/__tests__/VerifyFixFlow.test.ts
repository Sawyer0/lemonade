import { describe, it, expect } from 'vitest';
import { FakeObdAdapter } from '../adapter';
import { ObdCaptureService } from '../ObdCaptureService';
import { evaluateVerifyFix, runVerifyFix } from '../VerifyFixFlow';
import type { ObdScanResult } from '../types';
import { CLEAN_CAR_TRANSCRIPT, FULL_SCAN_TRANSCRIPT } from './fixtures';

function rescanWith(overrides: Partial<ObdScanResult>): ObdScanResult {
    return {
        adapter: { name: 'ELM327 emulator', transport: 'emulator' },
        capturedAt: '2026-11-11T15:30:00.000Z',
        storedCodes: [],
        pendingCodes: [],
        permanentCodes: [],
        freezeFrame: null,
        mode06: [],
        readiness: {
            milOn: false,
            storedCodeCount: 0,
            monitors: [{ name: 'Catalyst', supported: true, complete: true }],
        },
        vin: null,
        calibrationIds: [],
        calibrationVerificationNumbers: [],
        liveReadings: [],
        ...overrides,
    };
}

describe('evaluateVerifyFix', () => {
    it('passes when the drive cycle ran, monitors are ready and no code returned', () => {
        const result = evaluateVerifyFix({
            driveCycleCompleted: true,
            rescan: rescanWith({}),
            clearedAt: '2026-11-11T15:00:00.000Z',
            rescannedAt: '2026-11-11T15:30:00.000Z',
        });
        expect(result).toMatchObject({ passed: true, monitorsReady: true, monitorsNotReady: [] });
    });

    it('fails when a supported monitor is still incomplete', () => {
        const result = evaluateVerifyFix({
            driveCycleCompleted: true,
            rescan: rescanWith({
                readiness: {
                    milOn: false,
                    storedCodeCount: 0,
                    monitors: [
                        { name: 'Catalyst', supported: true, complete: false },
                        { name: 'Heated catalyst', supported: false, complete: false },
                    ],
                },
            }),
            clearedAt: '2026-11-11T15:00:00.000Z',
            rescannedAt: '2026-11-11T15:30:00.000Z',
        });
        expect(result.passed).toBe(false);
        expect(result.monitorsReady).toBe(false);
        expect(result.monitorsNotReady).toEqual(['Catalyst']);
    });

    it('fails when a pending code returns, and names it', () => {
        const result = evaluateVerifyFix({
            driveCycleCompleted: true,
            rescan: rescanWith({ pendingCodes: ['P0300'] }),
            clearedAt: '2026-11-11T15:00:00.000Z',
            rescannedAt: '2026-11-11T15:30:00.000Z',
        });
        expect(result.passed).toBe(false);
        expect(result.returnedPendingCodes).toEqual(['P0300']);
    });

    it('fails when the drive cycle did not run, even with a clean rescan', () => {
        const result = evaluateVerifyFix({
            driveCycleCompleted: false,
            rescan: rescanWith({}),
            clearedAt: '2026-11-11T15:00:00.000Z',
            rescannedAt: '2026-11-11T15:30:00.000Z',
        });
        expect(result.passed).toBe(false);
    });
});

describe('runVerifyFix', () => {
    it('clears the codes, rescans the clean car and passes', async () => {
        const adapter = new FakeObdAdapter(CLEAN_CAR_TRANSCRIPT);
        await adapter.connect();
        const capture = new ObdCaptureService(adapter, () => new Date('2026-11-11T15:30:00.000Z'));

        const { result, rescan } = await runVerifyFix(capture, true);

        expect(adapter.sentCommands[0]).toBe('04');
        expect(result.passed).toBe(true);
        expect(rescan.storedCodes).toEqual([]);
    });

    it('records the failure when the fault comes back', async () => {
        const adapter = new FakeObdAdapter(FULL_SCAN_TRANSCRIPT);
        await adapter.connect();
        const capture = new ObdCaptureService(adapter, () => new Date('2026-11-11T15:30:00.000Z'));

        const { result } = await runVerifyFix(capture, true);

        expect(result.passed).toBe(false);
        expect(result.returnedStoredCodes).toEqual(['P0300', 'P0420']);
        expect(result.returnedPendingCodes).toEqual(['P0300']);
    });
});
