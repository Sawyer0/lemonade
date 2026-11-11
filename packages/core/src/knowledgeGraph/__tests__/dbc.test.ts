import { describe, it, expect } from 'vitest';
import { DbcDatabase } from '../decoders/dbc';

const ENGINE_DBC = `
BO_ 100 EngineData: 8 Vector__XXX
 SG_ RPM : 0|16@1+ (0.25,0) [0|8000] "rpm" Vector__XXX
 SG_ CoolantTemp : 16|8@1+ (1,-40) [0|255] "degC" Vector__XXX
 SG_ Throttle : 24|8@1+ (0.39215686,0) [0|100] "%" Vector__XXX
 SG_ Torque : 32|16@1- (0.5,0) [-500|500] "Nm" Vector__XXX
BO_ 200 BigEndianData: 8 Vector__XXX
 SG_ Pressure : 7|16@0+ (0.1,0) [0|6553.5] "kPa" Vector__XXX
`;

describe('DbcDatabase.parse', () => {
    it('parses messages and signals from DBC text', () => {
        const database = DbcDatabase.parse(ENGINE_DBC);
        expect(database.allMessages()).toHaveLength(2);
        const engine = database.messageById(100);
        expect(engine?.name).toBe('EngineData');
        expect(engine?.dlc).toBe(8);
        expect(engine?.signals.map((signal) => signal.name)).toEqual(['RPM', 'CoolantTemp', 'Throttle', 'Torque']);
        expect(database.messageByName('BigEndianData')?.id).toBe(200);
        expect(database.messageById(999)).toBeUndefined();
    });

    it('rejects text with no messages', () => {
        expect(() => DbcDatabase.parse('# just a comment\n')).toThrow(/no messages/);
    });

    it('rejects a duplicate message id', () => {
        expect(() => DbcDatabase.parse('BO_ 100 A: 8 Vector__XXX\nBO_ 100 B: 8 Vector__XXX\n')).toThrow(
            /more than once/,
        );
    });

    it('rejects a multiplexed signal instead of misreading it', () => {
        expect(() =>
            DbcDatabase.parse('BO_ 100 A: 8 Vector__XXX\n SG_ Muxed m12 : 0|8@1+ (1,0) [0|255] "" Vector__XXX\n'),
        ).toThrow(/multiplexed signal 'Muxed' is not supported/);
    });

    it('rejects a signal before any message', () => {
        expect(() => DbcDatabase.parse(' SG_ Orphan : 0|8@1+ (1,0) [0|255] "" Vector__XXX\n')).toThrow(
            /before any message/,
        );
    });
});

describe('DbcDatabase.decode', () => {
    const database = DbcDatabase.parse(ENGINE_DBC);

    it('decodes little-endian signals with factor and offset', () => {
        // RPM raw 4000 -> 1000 rpm; coolant raw 100 -> 60 degC; throttle raw 50 -> ~19.6%.
        const decoded = database.decode(100, [0xa0, 0x0f, 100, 50, 0x9c, 0xff, 0, 0]);
        expect(decoded['RPM']).toEqual({ rawValue: 4000, value: 1000, unit: 'rpm' });
        expect(decoded['CoolantTemp']).toEqual({ rawValue: 100, value: 60, unit: 'degC' });
        expect(decoded['Throttle']?.value).toBeCloseTo(19.6078, 4);
    });

    it('sign-extends a signed signal', () => {
        const decoded = database.decode(100, [0, 0, 0, 0, 0x9c, 0xff, 0, 0]);
        expect(decoded['Torque']).toEqual({ rawValue: -100, value: -50, unit: 'Nm' });
    });

    it('decodes a Motorola (big-endian) signal', () => {
        // Pressure raw 1000 -> 100.0 kPa, laid out MSB-first from DBC bit 7.
        const decoded = database.decode(200, [0x00, 0x07, 0xd0, 0, 0, 0, 0, 0]);
        expect(decoded['Pressure']).toEqual({ rawValue: 1000, value: 100, unit: 'kPa' });
    });

    it('rejects an unknown message id', () => {
        expect(() => database.decode(999, [0, 0, 0, 0, 0, 0, 0, 0])).toThrow(/no message with id 999/);
    });

    it('rejects a payload shorter than the DLC', () => {
        expect(() => database.decode(100, [0xa0, 0x0f])).toThrow(/shorter than its DLC/);
    });
});
