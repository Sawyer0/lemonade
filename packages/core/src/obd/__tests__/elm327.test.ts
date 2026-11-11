import { describe, it, expect } from 'vitest';
import {
    ObdError,
    decodeDtcBytes,
    decodePidValue,
    parseCalibrationIdResponse,
    parseCalibrationVerificationResponse,
    parseDtcResponse,
    parseFreezeFrameDtcResponse,
    parseFreezeFramePidResponse,
    parseLivePidResponse,
    parseMode06Response,
    parseMode06SupportedResponse,
    parseReadinessResponse,
    parseVinResponse,
    scrubElm327Response,
} from '../elm327';

describe('scrubElm327Response', () => {
    it('drops the echo, prompt and SEARCHING lines', () => {
        const { bytes, noData } = scrubElm327Response('03\rSEARCHING...\r43 03 00\r\r>', '03');
        expect(noData).toBe(false);
        expect(bytes).toEqual([0x43, 0x03, 0x00]);
    });

    it('flags NO DATA instead of throwing', () => {
        expect(scrubElm327Response('NO DATA\r\r>').noData).toBe(true);
    });

    it('raises not-connected for UNABLE TO CONNECT', () => {
        expect(() => scrubElm327Response('UNABLE TO CONNECT\r\r>')).toThrowError(ObdError);
        try {
            scrubElm327Response('UNABLE TO CONNECT\r\r>');
        } catch (error) {
            expect((error as ObdError).kind).toBe('not-connected');
        }
    });

    it('raises on an empty reply', () => {
        expect(() => scrubElm327Response('\r\r>')).toThrowError(ObdError);
    });

    it('concatenates multi-frame replies, dropping the count line and frame numbers', () => {
        const { bytes } = scrubElm327Response(
            '014\r0: 49 02 01 31 48 47 43\r1: 4D 38 32 36 33 33 41 30\r2: 30 34 33 35 32\r\r>',
        );
        expect(bytes.slice(0, 3)).toEqual([0x49, 0x02, 0x01]);
        expect(bytes).toHaveLength(20);
    });
});

describe('decodeDtcBytes', () => {
    it('decodes each system letter from the top two bits', () => {
        // P0300 (03 00), C1234 (52 34), B0001 (80 01), U0100 (C1 00).
        expect(decodeDtcBytes([0x03, 0x00, 0x52, 0x34, 0x80, 0x01, 0xc1, 0x00])).toEqual([
            'P0300',
            'C1234',
            'B0001',
            'U0100',
        ]);
    });

    it('skips 0000 slots and deduplicates', () => {
        expect(decodeDtcBytes([0x03, 0x00, 0x00, 0x00, 0x03, 0x00])).toEqual(['P0300']);
    });
});

describe('parseDtcResponse', () => {
    it('parses stored codes from a Mode 03 reply', () => {
        expect(parseDtcResponse('43 03 00 04 20\r\r>', 3)).toEqual(['P0300', 'P0420']);
    });

    it('returns an empty list for NO DATA', () => {
        expect(parseDtcResponse('NO DATA\r\r>', 7)).toEqual([]);
    });

    it('rejects a reply for the wrong mode', () => {
        expect(() => parseDtcResponse('47 03 00\r\r>', 3)).toThrowError(ObdError);
    });
});

describe('decodePidValue', () => {
    it.each([
        ['0C', [0x27, 0x10], 2500, 'rpm'],
        ['0D', [0x32], 50, 'km/h'],
        ['05', [0x82], 90, '°C'],
        ['06', [0x80], 0, '%'],
        ['07', [0x90], 12.5, '%'],
        ['10', [0x01, 0xf4], 5, 'g/s'],
        ['11', [0x80], 50.2, '%'],
        ['42', [0x2e, 0xe0], 12.0, 'V'],
        ['2F', [0x80], 50.2, '%'],
    ])('decodes PID %s from %s', (pid, bytes, value, unit) => {
        const decoded = decodePidValue(pid, bytes);
        expect(decoded?.value).toBeCloseTo(value, 1);
        expect(decoded?.unit).toBe(unit);
    });

    it('returns null for an unknown PID', () => {
        expect(decodePidValue('FF', [0x00])).toBeNull();
    });
});

describe('parseLivePidResponse', () => {
    it('walks multi-PID blocks in order', () => {
        const readings = parseLivePidResponse('41 05 82 0C 27 10 0D 00 11 26 2F 80\r\r>', '2026-11-11T15:00:00.000Z');
        expect(readings.map((reading) => reading.pid)).toEqual(['05', '0C', '0D', '11', '2F']);
        expect(readings[0]?.label).toBe('Engine coolant temperature');
        expect(readings[0]?.value).toBe(90);
        expect(readings[1]?.value).toBe(2500);
        expect(readings[2]?.value).toBe(0);
        expect(readings[3]?.value).toBeCloseTo(14.9, 1);
        expect(readings[4]?.value).toBeCloseTo(50.2, 1);
    });

    it('returns no readings for NO DATA', () => {
        expect(parseLivePidResponse('NO DATA\r\r>', '2026-11-11T15:00:00.000Z')).toEqual([]);
    });
});

describe('parseReadinessResponse', () => {
    it('decodes MIL, code count and per-monitor readiness', () => {
        const readiness = parseReadinessResponse('41 01 81 07 E5 00\r\r>');
        expect(readiness.milOn).toBe(true);
        expect(readiness.storedCodeCount).toBe(1);
        const byName = new Map(readiness.monitors.map((monitor) => [monitor.name, monitor]));
        expect(byName.get('Misfire')).toEqual({ name: 'Misfire', supported: true, complete: true });
        expect(byName.get('Catalyst')).toEqual({ name: 'Catalyst', supported: true, complete: true });
        expect(byName.get('Heated catalyst')).toEqual({ name: 'Heated catalyst', supported: false, complete: true });
        expect(byName.get('Evaporative system')).toEqual({
            name: 'Evaporative system',
            supported: true,
            complete: true,
        });
        expect(byName.get('EGR / VVT')).toEqual({ name: 'EGR / VVT', supported: true, complete: true });
    });

    it('reports a monitor incomplete when its ready bit is set', () => {
        const readiness = parseReadinessResponse('41 01 01 07 E5 01\r\r>');
        expect(readiness.milOn).toBe(false);
        expect(readiness.storedCodeCount).toBe(1);
        expect(readiness.monitors.find((monitor) => monitor.name === 'Catalyst')).toEqual({
            name: 'Catalyst',
            supported: true,
            complete: false,
        });
    });
});

describe('parseMode06Response', () => {
    it('lists supported test IDs from 0600', () => {
        expect(parseMode06SupportedResponse('46 00 82 40 00 00\r\r>')).toEqual(['01', '07', '0A']);
    });

    it('parses value, min and max and judges pass/fail by range', () => {
        const [passing, failing] = parseMode06Response('46 01 01 00 0A 00 00 00 80 0A 11 00 64 00 00 00 36\r\r>') as [
            ReturnType<typeof parseMode06Response>[number],
            ReturnType<typeof parseMode06Response>[number],
        ];
        expect(passing).toMatchObject({ testId: '01', componentId: '01', value: 10, min: 0, max: 128, passed: true });
        expect(failing).toMatchObject({ testId: '0A', componentId: '11', value: 100, min: 0, max: 54, passed: false });
    });
});

describe('parseVinResponse', () => {
    it('reassembles a multi-frame VIN', () => {
        expect(
            parseVinResponse('014\r0: 49 02 01 31 48 47 43\r1: 4D 38 32 36 33 33 41 30\r2: 30 34 33 35 32\r\r>'),
        ).toBe('1HGCM82633A004352');
    });

    it('returns null for NO DATA', () => {
        expect(parseVinResponse('NO DATA\r\r>')).toBeNull();
    });
});

describe('parseCalibrationIdResponse', () => {
    it('returns one ASCII calibration ID per message', () => {
        expect(parseCalibrationIdResponse('49 04 01 50 30 31 32 33 34 35 36\r\r>')).toEqual(['P0123456']);
    });
});

describe('parseCalibrationVerificationResponse', () => {
    it('returns the CVN as a hex string', () => {
        expect(parseCalibrationVerificationResponse('49 06 01 12 34 56 78\r\r>')).toEqual(['12345678']);
    });
});

describe('freeze frame', () => {
    it('parses the triggering DTC', () => {
        expect(parseFreezeFrameDtcResponse('42 02 03 00\r\r>')).toBe('P0300');
        expect(parseFreezeFrameDtcResponse('42 02 00 00\r\r>')).toBeNull();
    });

    it('parses one frozen PID reading', () => {
        const reading = parseFreezeFramePidResponse('42 0C 27 10\r\r>', '2026-11-11T15:00:00.000Z');
        expect(reading).toMatchObject({ pid: '0C', value: 2500, unit: 'rpm' });
    });
});
