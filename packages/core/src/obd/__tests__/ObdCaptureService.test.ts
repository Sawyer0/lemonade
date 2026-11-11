import { describe, it, expect } from 'vitest';
import { FakeObdAdapter } from '../adapter';
import { ObdError } from '../elm327';
import { ObdCaptureService } from '../ObdCaptureService';
import { CLEAN_CAR_TRANSCRIPT, FULL_SCAN_TRANSCRIPT } from './fixtures';

const FIXED_NOW = new Date('2026-11-11T15:00:00.000Z');

async function connectedAdapter(transcript: Readonly<Record<string, string>>): Promise<FakeObdAdapter> {
    const adapter = new FakeObdAdapter(transcript);
    await adapter.connect();
    return adapter;
}

describe('ObdCaptureService.captureFullScan', () => {
    it('reads every mode in one tap and returns a ledger-ready scan', async () => {
        const capture = new ObdCaptureService(await connectedAdapter(FULL_SCAN_TRANSCRIPT), () => FIXED_NOW);

        const scan = await capture.captureFullScan();

        expect(scan.adapter).toEqual({ name: 'ELM327 emulator', transport: 'emulator' });
        expect(scan.capturedAt).toBe('2026-11-11T15:00:00.000Z');
        expect(scan.storedCodes).toEqual(['P0300', 'P0420']);
        expect(scan.pendingCodes).toEqual(['P0300']);
        expect(scan.permanentCodes).toEqual([]);
        expect(scan.freezeFrame).toMatchObject({
            dtc: 'P0300',
            readings: expect.arrayContaining([expect.objectContaining({ pid: '0C', value: 2500, unit: 'rpm' })]),
        });
        expect(scan.mode06).toHaveLength(3);
        expect(scan.mode06.every((result) => result.passed)).toBe(true);
        expect(scan.readiness.milOn).toBe(true);
        expect(scan.readiness.storedCodeCount).toBe(1);
        expect(scan.vin).toBe('1HGCM82633A004352');
        expect(scan.calibrationIds).toEqual(['P0123456']);
        expect(scan.calibrationVerificationNumbers).toEqual(['12345678']);
        expect(scan.liveReadings.map((reading) => reading.pid)).toEqual(['05', '0C', '0D', '11', '2F']);
    });

    it('sends the init sequence first, then the modes in order', async () => {
        const adapter = await connectedAdapter(FULL_SCAN_TRANSCRIPT);
        const capture = new ObdCaptureService(adapter, () => FIXED_NOW);

        await capture.captureFullScan();

        expect(adapter.sentCommands.slice(0, 7)).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', '0100']);
        expect(adapter.sentCommands).toContain('03');
        expect(adapter.sentCommands).toContain('07');
        expect(adapter.sentCommands).toContain('0A');
        expect(adapter.sentCommands).toContain('06 00');
        expect(adapter.sentCommands).toContain('09 02');
    });

    it('records a clean car with no codes and no freeze frame', async () => {
        const capture = new ObdCaptureService(await connectedAdapter(CLEAN_CAR_TRANSCRIPT), () => FIXED_NOW);

        const scan = await capture.captureFullScan();

        expect(scan.storedCodes).toEqual([]);
        expect(scan.pendingCodes).toEqual([]);
        expect(scan.freezeFrame).toBeNull();
        expect(scan.readiness.milOn).toBe(false);
    });

    it('tolerates NO DATA from a mode instead of failing the scan', async () => {
        // The bus answers the probe, but every mode reports nothing: a car
        // with no codes, no freeze frame and no Mode 06 support.
        const capture = new ObdCaptureService(
            await connectedAdapter({ '0100': '41 00 BE 1F A8 13\r\r>' }),
            () => FIXED_NOW,
        );

        const scan = await capture.captureFullScan();

        expect(scan.storedCodes).toEqual([]);
        expect(scan.pendingCodes).toEqual([]);
        expect(scan.permanentCodes).toEqual([]);
        expect(scan.freezeFrame).toBeNull();
        expect(scan.mode06).toEqual([]);
        expect(scan.readiness).toEqual({ milOn: false, storedCodeCount: 0, monitors: [] });
        expect(scan.vin).toBeNull();
        expect(scan.liveReadings).toEqual([]);
    });

    it('refuses to scan while disconnected', async () => {
        const capture = new ObdCaptureService(new FakeObdAdapter(FULL_SCAN_TRANSCRIPT), () => FIXED_NOW);

        await expect(capture.captureFullScan()).rejects.toMatchObject({ kind: 'not-connected' });
    });

    it('fails the scan when the adapter cannot reach the car', async () => {
        const adapter = new FakeObdAdapter({ '0100': 'UNABLE TO CONNECT\r\r>' });
        await adapter.connect();
        const capture = new ObdCaptureService(adapter, () => FIXED_NOW);

        await expect(capture.captureFullScan()).rejects.toBeInstanceOf(ObdError);
    });
});

describe('ObdCaptureService.clearStoredCodes', () => {
    it('sends Mode 04 and accepts the 44 confirmation', async () => {
        const adapter = await connectedAdapter(FULL_SCAN_TRANSCRIPT);
        const capture = new ObdCaptureService(adapter, () => FIXED_NOW);

        await capture.clearStoredCodes();

        expect(adapter.sentCommands).toContain('04');
    });

    it('rejects a clear the adapter did not confirm', async () => {
        const adapter = new FakeObdAdapter({ '04': 'NO DATA\r\r>' });
        await adapter.connect();
        const capture = new ObdCaptureService(adapter, () => FIXED_NOW);

        await expect(capture.clearStoredCodes()).rejects.toBeInstanceOf(ObdError);
    });
});
