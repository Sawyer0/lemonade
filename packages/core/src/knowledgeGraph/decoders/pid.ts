// --- SAE J1979 Mode 01 PID decoding (LM-38) ---
// The standard Mode 01 formulas, as the standard itself defines them.
// Model-specific PIDs live in the OBDb signal sets (CC-BY-SA-4.0), kept
// as a separate data asset loaded at runtime; only these standard PIDs
// are implemented here. A response is hex text as a scan tool shows it
// ("41 0C 1A F8"); anything that is not a Mode 01 reply for the PID
// asked about fails with a reason instead of decoding garbage.

export interface PidReading {
    pid: number;
    name: string;
    value: number;
    unit: string;
}

export type DecodePidResult =
    { ok: true; reading: PidReading } | { ok: false; failure: { raw: string; reason: string } };

interface PidDefinition {
    pid: number;
    name: string;
    unit: string;
    /** Data bytes after the 41 + PID header. */
    dataBytes: number;
    decode: (data: readonly number[]) => number;
}

const BYTE_0 = (data: readonly number[]): number => data[0] ?? 0;
const BYTE_PAIR = (data: readonly number[]): number => (data[0] ?? 0) * 256 + (data[1] ?? 0);

const PID_DEFINITIONS: readonly PidDefinition[] = [
    {
        pid: 0x04,
        name: 'Calculated engine load',
        unit: '%',
        dataBytes: 1,
        decode: (data) => (BYTE_0(data) * 100) / 255,
    },
    { pid: 0x05, name: 'Engine coolant temperature', unit: '°C', dataBytes: 1, decode: (data) => BYTE_0(data) - 40 },
    {
        pid: 0x06,
        name: 'Short term fuel trim bank 1',
        unit: '%',
        dataBytes: 1,
        decode: (data) => ((BYTE_0(data) - 128) * 100) / 128,
    },
    {
        pid: 0x07,
        name: 'Long term fuel trim bank 1',
        unit: '%',
        dataBytes: 1,
        decode: (data) => ((BYTE_0(data) - 128) * 100) / 128,
    },
    {
        pid: 0x0b,
        name: 'Intake manifold absolute pressure',
        unit: 'kPa',
        dataBytes: 1,
        decode: (data) => BYTE_0(data),
    },
    { pid: 0x0c, name: 'Engine speed', unit: 'rpm', dataBytes: 2, decode: (data) => BYTE_PAIR(data) / 4 },
    { pid: 0x0d, name: 'Vehicle speed', unit: 'km/h', dataBytes: 1, decode: (data) => BYTE_0(data) },
    {
        pid: 0x0e,
        name: 'Timing advance',
        unit: '°',
        dataBytes: 1,
        decode: (data) => BYTE_0(data) / 2 - 64,
    },
    { pid: 0x0f, name: 'Intake air temperature', unit: '°C', dataBytes: 1, decode: (data) => BYTE_0(data) - 40 },
    { pid: 0x10, name: 'Mass air flow rate', unit: 'g/s', dataBytes: 2, decode: (data) => BYTE_PAIR(data) / 100 },
    { pid: 0x11, name: 'Throttle position', unit: '%', dataBytes: 1, decode: (data) => (BYTE_0(data) * 100) / 255 },
    { pid: 0x2f, name: 'Fuel tank level', unit: '%', dataBytes: 1, decode: (data) => (BYTE_0(data) * 100) / 255 },
    {
        pid: 0x42,
        name: 'Control module voltage',
        unit: 'V',
        dataBytes: 2,
        decode: (data) => BYTE_PAIR(data) / 1000,
    },
    { pid: 0x5c, name: 'Engine oil temperature', unit: '°C', dataBytes: 1, decode: (data) => BYTE_0(data) - 40 },
];

const PID_BY_NUMBER = new Map(PID_DEFINITIONS.map((definition) => [definition.pid, definition]));

function parseHexBytes(raw: string): number[] | undefined {
    const cleaned = raw.trim().replace(/\s+/g, '');
    if (cleaned.length === 0 || cleaned.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(cleaned)) {
        return undefined;
    }
    const bytes: number[] = [];
    for (let index = 0; index < cleaned.length; index += 2) {
        bytes.push(Number.parseInt(cleaned.slice(index, index + 2), 16));
    }
    return bytes;
}

/**
 * Decodes one Mode 01 response for the PID asked about. The service byte
 * must be 0x41, the PID byte must match, and the data length must match
 * the PID's definition; anything else is a failure with a reason.
 */
export function decodePidResponse(raw: string, pid: number): DecodePidResult {
    const fail = (reason: string): DecodePidResult => ({ ok: false, failure: { raw, reason } });
    const definition = PID_BY_NUMBER.get(pid);
    if (definition === undefined) {
        return fail(
            `PID 0x${pid.toString(16).toUpperCase().padStart(2, '0')} is not a standard PID this decoder knows`,
        );
    }
    const bytes = parseHexBytes(raw);
    if (bytes === undefined) {
        return fail('Response is not hex text (expected bytes like "41 0C 1A F8")');
    }
    if (bytes.length < 2) {
        return fail(`Response is ${bytes.length} bytes; a Mode 01 reply needs at least the 41 header and a PID byte`);
    }
    if (bytes[0] !== 0x41) {
        return fail(`Service byte is 0x${(bytes[0] ?? 0).toString(16).toUpperCase()}, not 0x41 (Mode 01 reply)`);
    }
    if (bytes[1] !== pid) {
        return fail(
            `Response is for PID 0x${(bytes[1] ?? 0).toString(16).toUpperCase().padStart(2, '0')}, not the PID asked about`,
        );
    }
    const data = bytes.slice(2);
    if (data.length < definition.dataBytes) {
        return fail(
            `PID 0x${pid.toString(16).toUpperCase().padStart(2, '0')} needs ${definition.dataBytes} data bytes, got ${data.length}`,
        );
    }
    return {
        ok: true,
        reading: { pid, name: definition.name, value: definition.decode(data), unit: definition.unit },
    };
}

/** The standard PIDs this decoder knows, by number. */
export function supportedPids(): number[] {
    return PID_DEFINITIONS.map((definition) => definition.pid);
}
