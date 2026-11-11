import { describe, it, expect } from 'vitest';
import { decodePidResponse, supportedPids } from '../decoders/pid';

describe('decodePidResponse', () => {
    it('decodes engine speed from a Mode 01 reply', () => {
        const result = decodePidResponse('41 0C 1A F8', 0x0c);
        expect(result).toEqual({
            ok: true,
            reading: { pid: 0x0c, name: 'Engine speed', value: 1726, unit: 'rpm' },
        });
    });

    it('accepts compact hex without spaces', () => {
        const result = decodePidResponse('410D50', 0x0d);
        expect(result).toEqual({
            ok: true,
            reading: { pid: 0x0d, name: 'Vehicle speed', value: 80, unit: 'km/h' },
        });
    });

    it('decodes coolant temperature with its -40 offset', () => {
        const result = decodePidResponse('41 05 5A', 0x05);
        expect(result).toEqual({
            ok: true,
            reading: { pid: 0x05, name: 'Engine coolant temperature', value: 50, unit: '°C' },
        });
    });

    it('decodes mass air flow from two data bytes', () => {
        const result = decodePidResponse('41 10 02 58', 0x10);
        expect(result).toEqual({
            ok: true,
            reading: { pid: 0x10, name: 'Mass air flow rate', value: 6, unit: 'g/s' },
        });
    });

    it('decodes control module voltage', () => {
        const result = decodePidResponse('41 42 2E 10', 0x42);
        expect(result).toEqual({
            ok: true,
            reading: { pid: 0x42, name: 'Control module voltage', value: 11.792, unit: 'V' },
        });
    });

    it('rejects a reply whose service byte is not 0x41', () => {
        const result = decodePidResponse('42 0C 1A F8', 0x0c);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/not 0x41/);
        }
    });

    it('rejects a reply for a different PID', () => {
        const result = decodePidResponse('41 0D 50', 0x0c);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/not the PID asked about/);
        }
    });

    it('rejects a reply too short for its PID', () => {
        const result = decodePidResponse('41 0C 1A', 0x0c);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/needs 2 data bytes/);
        }
    });

    it('rejects text that is not hex', () => {
        const result = decodePidResponse('not hex at all', 0x0c);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/not hex text/);
        }
    });

    it('rejects a PID the decoder does not know', () => {
        const result = decodePidResponse('41 99 00', 0x99);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/not a standard PID/);
        }
    });

    it('lists the standard PIDs it knows', () => {
        const pids = supportedPids();
        for (const pid of [0x04, 0x05, 0x0c, 0x0d, 0x10, 0x42]) {
            expect(pids).toContain(pid);
        }
    });
});
