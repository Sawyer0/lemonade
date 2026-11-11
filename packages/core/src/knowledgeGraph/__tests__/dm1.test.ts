import { describe, it, expect } from 'vitest';
import { DM1_PGN, decodeDm1, fmiMeaning } from '../decoders/dm1';

describe('decodeDm1', () => {
    it('decodes lamp status and two DTCs from a reassembled payload', () => {
        // Lamp byte 0x44: malfunction lamp on, amber warning on. SPN 110 FMI 0
        // occurrence 1; SPN 91 FMI 3 occurrence 5.
        const result = decodeDm1([0x44, 0x00, 0x6e, 0x00, 0x00, 0x01, 0x5b, 0x00, 0x03, 0x05]);
        expect(result).toEqual({
            ok: true,
            frame: {
                lampStatus: {
                    malfunctionIndicator: 'on',
                    redStop: 'off',
                    amberWarning: 'on',
                    protect: 'off',
                },
                dtcs: [
                    {
                        spn: 110,
                        spnName: null,
                        fmi: 0,
                        fmiMeaning: 'Data valid but above normal operating range, most severe level',
                        occurrenceCount: 1,
                        conversionMethod: 0,
                    },
                    {
                        spn: 91,
                        spnName: null,
                        fmi: 3,
                        fmiMeaning: 'Voltage above normal, or shorted to high source',
                        occurrenceCount: 5,
                        conversionMethod: 0,
                    },
                ],
            },
        });
    });

    it('decodes a 19-bit SPN above 65535', () => {
        const result = decodeDm1([0x00, 0x00, 0xa0, 0x86, 0x24, 0x00]);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.frame.dtcs).toHaveLength(1);
            expect(result.frame.dtcs[0]?.spn).toBe(100000);
            expect(result.frame.dtcs[0]?.fmi).toBe(4);
            expect(result.frame.dtcs[0]?.fmiMeaning).toBe('Voltage below normal, or shorted to low source');
        }
    });

    it('skips 0xFF padding after a single DTC in an 8-byte frame', () => {
        const result = decodeDm1([0x40, 0x00, 0x6e, 0x00, 0x00, 0x01, 0xff, 0xff]);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.frame.dtcs).toHaveLength(1);
            expect(result.frame.dtcs[0]?.spn).toBe(110);
        }
    });

    it('never invents an SPN name: spnName stays null', () => {
        const result = decodeDm1([0x00, 0x00, 0x6e, 0x00, 0x00, 0x01]);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.frame.dtcs[0]?.spnName).toBeNull();
        }
    });

    it('rejects a payload shorter than one DTC', () => {
        const result = decodeDm1([0x40, 0x00, 0x6e, 0x00, 0x00]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/at least 2 lamp bytes and one 4-byte DTC/);
        }
    });

    it('rejects a trailing partial DTC that is not padding', () => {
        const result = decodeDm1([0x40, 0x00, 0x6e, 0x00, 0x00, 0x01, 0x5b, 0x00]);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failure.reason).toMatch(/truncated DTC/);
        }
    });

    it('exposes the DM1 PGN', () => {
        expect(DM1_PGN).toBe(65226);
    });
});

describe('fmiMeaning', () => {
    it('names every FMI from 0 to 21 and 31', () => {
        for (const fmi of [0, 1, 2, 7, 11, 14, 15, 19, 20, 21, 31]) {
            expect(fmiMeaning(fmi)).not.toBe('Reserved');
        }
        expect(fmiMeaning(31)).toBe('Condition exists');
    });

    it('marks FMI 22-30 reserved', () => {
        for (const fmi of [22, 25, 30]) {
            expect(fmiMeaning(fmi)).toBe('Reserved');
        }
    });

    it('rejects an FMI outside 0-31', () => {
        expect(() => fmiMeaning(32)).toThrow(/FMI must be an integer from 0 to 31/);
    });
});
