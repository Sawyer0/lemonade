import { describe, it, expect } from 'vitest';
import { describeDtc, genericDescription } from '../decoders/dtcText';

describe('describeDtc', () => {
    it('describes a generic code from the table', () => {
        const result = describeDtc('P0300');
        expect(result).toEqual({
            ok: true,
            text: {
                code: 'P0300',
                system: 'P',
                systemName: 'Powertrain',
                generic: true,
                subsystem: 'Ignition system or misfire',
                description: 'Random/multiple cylinder misfire detected',
            },
        });
    });

    it('normalises lowercase and a DTC label', () => {
        const result = describeDtc('dtc p0171');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.text.code).toBe('P0171');
            expect(result.text.description).toBe('System too lean (bank 1)');
        }
    });

    it('gives no description for a manufacturer-specific code', () => {
        const result = describeDtc('P1336');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.text.generic).toBe(false);
            expect(result.text.description).toBeNull();
        }
    });

    it('gives no description for a generic code with no table entry', () => {
        const result = describeDtc('P0200');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.text.generic).toBe(true);
            expect(result.text.description).toBeNull();
        }
    });

    it('fails an invalid code with the parser reason', () => {
        const result = describeDtc('XXXXX');
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/System letter must be P, B, C or U/);
        }
    });
});

describe('genericDescription', () => {
    it('returns the table entry for a known code', () => {
        expect(genericDescription('P0420')).toBe('Catalyst system efficiency below threshold (bank 1)');
    });

    it('returns null for an unknown code instead of inventing one', () => {
        expect(genericDescription('P9999')).toBeNull();
    });
});
