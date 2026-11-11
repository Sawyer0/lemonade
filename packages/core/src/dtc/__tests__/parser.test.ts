import { describe, it, expect } from 'vitest';
import { normalizeDtcInput, parseDtc, parseDtcBatch } from '../parser';
import type { ParsedDtc } from '../types';

describe('normalizeDtcInput', () => {
    it.each([
        ['P0300', 'P0300'],
        ['p0300', 'P0300'],
        ['P 0300', 'P0300'],
        ['P-0300', 'P0300'],
        ['P.0300', 'P0300'],
        ['DTC P0420', 'P0420'],
        ['DTCP0420', 'P0420'],
        ['PO3OO', 'P0300'],
        ['P0l71', 'P0171'],
        ['  p0420  ', 'P0420'],
    ])('normalises %s to %s', (raw, expected) => {
        expect(normalizeDtcInput(raw)).toBe(expected);
    });
});

describe('parseDtc valid codes', () => {
    const cases: Array<{
        raw: string;
        code: string;
        system: ParsedDtc['system'];
        systemName: string;
        generic: boolean;
        subsystem: string;
        description: string | null;
    }> = [
        {
            raw: 'P0300',
            code: 'P0300',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Ignition system or misfire',
            description: 'Random/multiple cylinder misfire detected',
        },
        {
            raw: 'p0171',
            code: 'P0171',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Fuel and air metering',
            description: 'System too lean (bank 1)',
        },
        {
            raw: 'P0420',
            code: 'P0420',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Auxiliary emission controls',
            description: 'Catalyst system efficiency below threshold (bank 1)',
        },
        {
            raw: 'P0700',
            code: 'P0700',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Transmission',
            description: 'Transmission control system malfunction',
        },
        {
            raw: 'P0999',
            code: 'P0999',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'SAE reserved',
            description: null,
        },
        {
            raw: 'P1200',
            code: 'P1200',
            system: 'P',
            systemName: 'Powertrain',
            generic: false,
            subsystem: 'Fuel and air metering (injector circuit)',
            description: null,
        },
        {
            raw: 'P3100',
            code: 'P3100',
            system: 'P',
            systemName: 'Powertrain',
            generic: false,
            subsystem: 'Fuel and air metering',
            description: null,
        },
        {
            raw: 'P3400',
            code: 'P3400',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Auxiliary emission controls',
            description: null,
        },
        {
            raw: 'P0A80',
            code: 'P0A80',
            system: 'P',
            systemName: 'Powertrain',
            generic: true,
            subsystem: 'Hybrid propulsion system',
            description: 'Replace hybrid battery pack',
        },
        {
            raw: 'B0001',
            code: 'B0001',
            system: 'B',
            systemName: 'Body',
            generic: true,
            subsystem: 'Occupant restraint system',
            description: 'Driver frontal airbag deployment loop',
        },
        {
            raw: 'B1000',
            code: 'B1000',
            system: 'B',
            systemName: 'Body',
            generic: false,
            subsystem: 'Occupant restraint system',
            description: null,
        },
        {
            raw: 'C0035',
            code: 'C0035',
            system: 'C',
            systemName: 'Chassis',
            generic: true,
            subsystem: 'Anti-lock brake system',
            description: 'Left front wheel speed sensor circuit',
        },
        {
            raw: 'C2000',
            code: 'C2000',
            system: 'C',
            systemName: 'Chassis',
            generic: false,
            subsystem: 'Anti-lock brake system',
            description: null,
        },
        {
            raw: 'U0100',
            code: 'U0100',
            system: 'U',
            systemName: 'Network',
            generic: true,
            subsystem: 'Network communication',
            description: 'Lost communication with ECM/PCM A',
        },
        {
            raw: 'U0300',
            code: 'U0300',
            system: 'U',
            systemName: 'Network',
            generic: true,
            subsystem: 'Network software',
            description: null,
        },
        {
            raw: 'U2000',
            code: 'U2000',
            system: 'U',
            systemName: 'Network',
            generic: false,
            subsystem: 'Network electrical',
            description: null,
        },
    ];

    it.each(cases)('parses $raw', ({ raw, code, system, systemName, generic, subsystem, description }) => {
        const result = parseDtc(raw);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.parsed).toMatchObject({ code, system, systemName, generic, subsystem, description });
        expect(result.parsed.subsystemDigit).toBe(code[2]);
    });

    it('parses the same code deterministically on repeat calls', () => {
        expect(parseDtc('P0300')).toEqual(parseDtc('p 0300'));
    });
});

describe('parseDtc invalid codes', () => {
    const cases: Array<{ raw: string; reason: RegExp }> = [
        { raw: '', reason: /Empty DTC/ },
        { raw: '   ', reason: /Empty DTC/ },
        { raw: 'X0300', reason: /System letter must be P, B, C or U/ },
        { raw: '0300', reason: /Expected 5 characters/ },
        { raw: 'P030', reason: /Expected 5 characters/ },
        { raw: 'P03000', reason: /Expected 5 characters/ },
        { raw: 'P03G0', reason: /hexadecimal digits/ },
        { raw: 'PZZZZ', reason: /hexadecimal digits/ },
        { raw: 'HELLO', reason: /System letter must be P, B, C or U/ },
    ];

    it.each(cases)('rejects $raw with a reason', ({ raw, reason }) => {
        const result = parseDtc(raw);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.raw).toBe(raw);
        expect(result.failure.reason).toMatch(reason);
    });
});

describe('parseDtcBatch', () => {
    it('parses valid codes, deduplicates, and reports every failure', () => {
        const { parsed, failures } = parseDtcBatch(['P0300', 'p0300', 'P 0420', 'X9999', 'P03', 'U0100']);

        expect(parsed.map((code) => code.code)).toEqual(['P0300', 'P0420', 'U0100']);
        expect(failures.map((failure) => failure.raw)).toEqual(['X9999', 'P03']);
        expect(failures.every((failure) => failure.reason.length > 0)).toBe(true);
    });

    it('returns empty results for an empty batch', () => {
        expect(parseDtcBatch([])).toEqual({ parsed: [], failures: [] });
    });
});
