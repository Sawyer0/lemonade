// --- ELM327 protocol (LM-03) ---
// Pure SAE J1979 / ISO 15031-5 parsing for an ELM327-compatible adapter.
// Nothing here touches Bluetooth or the network: it takes the raw text the
// adapter returned for one command and returns typed values. The decode
// table below is hand-written from SAE J1979 (a small subset of standard
// PIDs); no OBDb data is shipped, so no CC-BY-SA asset is bundled.
import { parseDtc } from '../dtc/parser';
import type { ObdMode06Result, ObdPidReading, ObdReadiness, ObdReadinessMonitor } from './types';

export type ObdErrorKind = 'no-data' | 'not-connected' | 'invalid-response' | 'timeout' | 'adapter';

/** A failed adapter exchange. `kind` says what went wrong; the message is safe to show the tech. */
export class ObdError extends Error {
    public readonly kind: ObdErrorKind;

    constructor(kind: ObdErrorKind, message: string) {
        super(message);
        this.kind = kind;
        this.name = 'ObdError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** Sent once per connection, in order: reset, quiet the adapter, auto protocol, prove the bus answers. */
export const ELM327_INIT_COMMANDS: readonly string[] = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0', '0100'];

/** Mode 01 PIDs the one-tap scan snapshots as live data. */
export const LIVE_SCAN_PIDS: readonly string[] = ['05', '0C', '0D', '11', '2F'];

/** Mode 02 PIDs read for the freeze frame snapshot. */
export const FREEZE_FRAME_PIDS: readonly string[] = ['05', '0C', '0D', '11', '2F'];

const HEX_PAIR = /^[0-9A-F]{2}$/;

/**
 * Strips an ELM327 reply down to its data bytes: drops the command echo,
 * prompt, SEARCHING lines and whitespace. 'NO DATA' is a real answer (the
 * car has nothing for that mode), not an error, so it comes back flagged.
 * Anything the adapter cannot do at all raises an ObdError.
 */
export function scrubElm327Response(raw: string, command?: string): { bytes: number[]; noData: boolean } {
    let lines = raw
        .split(/[\r\n]+/)
        .map((line) => line.trim().toUpperCase())
        .filter((line) => line.length > 0 && line !== '>' && line !== 'SEARCHING...');
    if (command) {
        const echo = command.trim().toUpperCase();
        const echoIndex = lines.indexOf(echo);
        if (echoIndex !== -1) lines.splice(echoIndex, 1);
    }
    const text = lines.join(' ');
    if (/\bUNABLE TO CONNECT\b/.test(text)) {
        throw new ObdError('not-connected', 'Adapter could not connect to the vehicle. Check the ignition is on.');
    }
    if (/\b(CAN ERROR|BUS ERROR|FB ERROR|BUFFER FULL|STOPPED)\b/.test(text)) {
        throw new ObdError('adapter', `Adapter reported an error: ${text}`);
    }
    if (text === '?' || text.startsWith('? ')) {
        throw new ObdError('invalid-response', 'Adapter did not understand the command.');
    }
    if (/\bNO DATA\b/.test(text)) {
        return { bytes: [], noData: true };
    }
    // Multi-frame replies (Mode 09 VIN / calibration IDs) arrive as a byte
    // count line followed by `N:`-numbered frames: `014` / `0: 49 02 01
    // ...` / `1: ...`. The count line is dropped and the frame numbers are
    // stripped, so the bytes concatenate into one message.
    if (
        lines.length > 1 &&
        /^[0-9A-F]+$/.test(lines[0] as string) &&
        lines.slice(1).every((line) => /^\d+:/.test(line))
    ) {
        lines = lines.slice(1);
    }
    const hex = lines.map((line) => line.replace(/^\d+:\s*/, '').replace(/[^0-9A-F]/g, '')).join('');
    if (hex.length === 0) {
        throw new ObdError('invalid-response', 'Adapter returned an empty response.');
    }
    if (hex.length % 2 !== 0) {
        throw new ObdError('invalid-response', `Adapter returned an odd number of hex digits: '${text}'`);
    }
    const bytes: number[] = [];
    for (let index = 0; index < hex.length; index += 2) {
        bytes.push(parseInt(hex.slice(index, index + 2), 16));
    }
    return { bytes, noData: false };
}

function requireMode(bytes: number[], mode: number, what: string): number[] {
    if (bytes.length === 0 || bytes[0] !== 0x40 + mode) {
        throw new ObdError(
            'invalid-response',
            `Expected a Mode ${mode.toString(16).toUpperCase()} response (0x${(0x40 + mode).toString(16).toUpperCase()}) for ${what}, got ${
                bytes
                    .map((byte) => byte.toString(16).padStart(2, '0'))
                    .join(' ')
                    .toUpperCase() || '(empty)'
            }`,
        );
    }
    return bytes.slice(1);
}

/**
 * Decodes raw DTC bytes (two per code) into canonical codes. The first
 * byte's top two bits pick the system (00 P, 01 C, 10 B, 11 U), the next
 * two bits are the designator digit, and the remaining nibbles are the
 * last three digits. 0000 means "no code here" and is skipped. Every code
 * is validated through the DTC parser, never trusted on shape alone.
 */
export function decodeDtcBytes(bytes: readonly number[]): string[] {
    const systems = ['P', 'C', 'B', 'U'] as const;
    const codes: string[] = [];
    for (let index = 0; index + 1 < bytes.length; index += 2) {
        const first = bytes[index] as number;
        const second = bytes[index + 1] as number;
        if (first === 0 && second === 0) continue;
        const raw =
            `${systems[(first >> 6) & 0x03]}${((first >> 4) & 0x03).toString(16)}${(first & 0x0f).toString(16)}${((second >> 4) & 0x0f).toString(16)}${(second & 0x0f).toString(16)}`.toUpperCase();
        const parsed = parseDtc(raw);
        if (!parsed.ok) {
            throw new ObdError(
                'invalid-response',
                `Adapter returned a malformed DTC '${raw}': ${parsed.failure.reason}`,
            );
        }
        codes.push(parsed.parsed.code);
    }
    return [...new Set(codes)];
}

/** Parses a Mode 03 / 07 / 0A response into canonical codes; NO DATA means no codes in that state. */
export function parseDtcResponse(raw: string, mode: 3 | 7 | 0x0a): string[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    return decodeDtcBytes(requireMode(bytes, mode, 'DTCs'));
}

// --- Live PIDs (Mode 01) ---

interface PidDecoder {
    label: string;
    byteCount: number;
    decode: (bytes: readonly number[]) => { value: number; unit: string };
}

function singleByte(label: string, decode: (a: number) => { value: number; unit: string }): PidDecoder {
    return { label, byteCount: 1, decode: (bytes) => decode(bytes[0] as number) };
}

function doubleByte(label: string, decode: (a: number, b: number) => { value: number; unit: string }): PidDecoder {
    return {
        label,
        byteCount: 2,
        decode: (bytes) => decode(bytes[0] as number, bytes[1] as number),
    };
}

const trim = (a: number): { value: number; unit: string } => ({ value: ((a - 128) * 100) / 128, unit: '%' });

/** SAE J1979 standard PID decoders, hand-written from the standard's formulas. */
export const PID_DECODERS: Readonly<Record<string, PidDecoder>> = {
    '04': singleByte('Calculated engine load', (a) => ({ value: (a * 100) / 255, unit: '%' })),
    '05': singleByte('Engine coolant temperature', (a) => ({ value: a - 40, unit: '°C' })),
    '06': singleByte('Short term fuel trim bank 1', trim),
    '07': singleByte('Long term fuel trim bank 1', trim),
    '08': singleByte('Short term fuel trim bank 2', trim),
    '09': singleByte('Long term fuel trim bank 2', trim),
    '0A': singleByte('Fuel pressure', (a) => ({ value: a * 3, unit: 'kPa' })),
    '0B': singleByte('Intake manifold pressure', (a) => ({ value: a, unit: 'kPa' })),
    '0C': doubleByte('Engine RPM', (a, b) => ({ value: (a * 256 + b) / 4, unit: 'rpm' })),
    '0D': singleByte('Vehicle speed', (a) => ({ value: a, unit: 'km/h' })),
    '0E': singleByte('Timing advance', (a) => ({ value: a / 2 - 64, unit: '°' })),
    '0F': singleByte('Intake air temperature', (a) => ({ value: a - 40, unit: '°C' })),
    '10': doubleByte('Mass air flow', (a, b) => ({ value: (a * 256 + b) / 100, unit: 'g/s' })),
    '11': singleByte('Throttle position', (a) => ({ value: (a * 100) / 255, unit: '%' })),
    '14': doubleByte('Oxygen sensor bank 1 sensor 1', (a) => ({ value: a / 200, unit: 'V' })),
    '15': doubleByte('Oxygen sensor bank 1 sensor 2', (a) => ({ value: a / 200, unit: 'V' })),
    '1F': doubleByte('Run time since engine start', (a, b) => ({ value: a * 256 + b, unit: 's' })),
    '21': doubleByte('Distance with MIL on', (a, b) => ({ value: a * 256 + b, unit: 'km' })),
    '2F': singleByte('Fuel level', (a) => ({ value: (a * 100) / 255, unit: '%' })),
    '33': singleByte('Barometric pressure', (a) => ({ value: a, unit: 'kPa' })),
    '42': doubleByte('Control module voltage', (a, b) => ({ value: (a * 256 + b) / 1000, unit: 'V' })),
    '5E': doubleByte('Engine fuel rate', (a, b) => ({ value: (a * 256 + b) / 20, unit: 'L/h' })),
};

/**
 * Decodes one PID from its data bytes. Returns null for a PID this table
 * does not know: an unknown PID is skipped, never guessed at.
 */
export function decodePidValue(
    pid: string,
    bytes: readonly number[],
): { value: number; unit: string; label: string } | null {
    const decoder = PID_DECODERS[pid.toUpperCase()];
    if (!decoder) return null;
    if (bytes.length < decoder.byteCount) return null;
    const decoded = decoder.decode(bytes.slice(0, decoder.byteCount));
    return { ...decoded, label: decoder.label };
}

/** The human name for a known PID, or null when this table does not know it. */
export function pidLabel(pid: string): string | null {
    return PID_DECODERS[pid.toUpperCase()]?.label ?? null;
}

/**
 * Parses a Mode 01 response for one or more PIDs (e.g. `01 0C 0D` returns
 * `41 0C xx xx 0D xx`): one `41` prefix, then PID + data pairs in order.
 * PIDs with NO DATA or an unknown decoder are skipped.
 */
export function parseLivePidResponse(raw: string, capturedAt: string): ObdPidReading[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    if (bytes.length === 0 || bytes[0] !== 0x41) {
        throw new ObdError('invalid-response', 'Expected a Mode 01 response (0x41).');
    }
    const readings: ObdPidReading[] = [];
    let index = 1;
    while (index < bytes.length) {
        const pid = (bytes[index] as number).toString(16).padStart(2, '0').toUpperCase();
        const decoder = PID_DECODERS[pid];
        if (!decoder) break;
        const data = bytes.slice(index + 1, index + 1 + decoder.byteCount);
        if (data.length < decoder.byteCount) break;
        const decoded = decoder.decode(data);
        readings.push({ pid, label: decoder.label, value: decoded.value, unit: decoded.unit, capturedAt });
        index += 1 + decoder.byteCount;
    }
    return readings;
}

// --- Readiness (Mode 01 PID 01) ---

// SAE J1979 PID 01: byte B holds the three continuous monitors (supported
// bits 0-2, ready bits 4-6); byte C holds the seven spark-ignition monitors
// supported; byte D holds the same seven ready. A supported bit set means
// the car has the monitor; a ready bit CLEAR means the test has run
// (completeness is indicated by a reset bit).
const CONTINUOUS_MONITORS: readonly { name: string; supportedBit: number; readyBit: number }[] = [
    { name: 'Misfire', supportedBit: 0x01, readyBit: 0x10 },
    { name: 'Fuel system', supportedBit: 0x02, readyBit: 0x20 },
    { name: 'Comprehensive components', supportedBit: 0x04, readyBit: 0x40 },
];

const SPARK_MONITORS: readonly { name: string; bit: number }[] = [
    { name: 'Catalyst', bit: 0x01 },
    { name: 'Heated catalyst', bit: 0x02 },
    { name: 'Evaporative system', bit: 0x04 },
    { name: 'Secondary air system', bit: 0x08 },
    { name: 'A/C refrigerant', bit: 0x10 },
    { name: 'Oxygen sensor', bit: 0x20 },
    { name: 'Oxygen sensor heater', bit: 0x40 },
    { name: 'EGR / VVT', bit: 0x80 },
];

/** Parses a `0101` response into MIL state, stored-code count and per-monitor readiness. */
export function parseReadinessResponse(raw: string): ObdReadiness {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) {
        throw new ObdError('no-data', 'Vehicle returned no readiness data (Mode 01 PID 01).');
    }
    const data = requireMode(bytes, 1, 'readiness');
    if (data.length < 5 || data[0] !== 0x01) {
        throw new ObdError('invalid-response', 'Readiness response is not a PID 01 reply.');
    }
    const [a, b, c, d] = data.slice(1, 5) as [number, number, number, number];
    const monitors: ObdReadinessMonitor[] = [
        ...CONTINUOUS_MONITORS.map(({ name, supportedBit, readyBit }) => ({
            name,
            supported: (b & supportedBit) !== 0,
            complete: (b & readyBit) === 0,
        })),
        ...SPARK_MONITORS.map(({ name, bit }) => ({
            name,
            supported: (c & bit) !== 0,
            complete: (d & bit) === 0,
        })),
    ];
    return { milOn: (a & 0x80) !== 0, storedCodeCount: a & 0x7f, monitors };
}

// --- Mode 06 ---

/** Parses a `0600` response into the supported test-ID bitmask. */
export function parseMode06SupportedResponse(raw: string): string[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    const data = requireMode(bytes, 6, 'Mode 06 supported tests');
    if (data.length < 5 || data[0] !== 0x00) return [];
    const supported: string[] = [];
    for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
        const byte = data[1 + byteIndex] as number;
        for (let bit = 7; bit >= 0; bit -= 1) {
            if ((byte & (1 << bit)) !== 0) {
                supported.push((byteIndex * 8 + (7 - bit) + 1).toString(16).padStart(2, '0').toUpperCase());
            }
        }
    }
    return supported;
}

// Units for the common Mode 06 test IDs. Anything else is reported in raw
// counts: the value and its limits share the scale, so pass/fail still holds.
const MODE06_UNITS: Readonly<Record<string, string>> = {
    '01': 'count',
    '02': 'count',
    '03': 'count',
    '04': 'count',
    '05': 'count',
    '06': 'count',
    '07': 'V',
    '08': 'V',
    '09': 'V',
    '0A': 'count',
    '0B': 'count',
    '10': 'count',
};

/**
 * Parses one `06 <tid>` response: `46 <tid> <cid> <value 2B> <min 2B>
 * <max 2B>`, repeated per test. A limit of 0x0000 / 0xFFFF on one side is a
 * single-sided test; the plain range check still decides it.
 */
export function parseMode06Response(raw: string): ObdMode06Result[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    const data = requireMode(bytes, 6, 'Mode 06 results');
    const results: ObdMode06Result[] = [];
    for (let index = 0; index + 7 < data.length; index += 8) {
        const testId = (data[index] as number).toString(16).padStart(2, '0').toUpperCase();
        const componentId = (data[index + 1] as number).toString(16).padStart(2, '0').toUpperCase();
        const value = ((data[index + 2] as number) << 8) | (data[index + 3] as number);
        const min = ((data[index + 4] as number) << 8) | (data[index + 5] as number);
        const max = ((data[index + 6] as number) << 8) | (data[index + 7] as number);
        results.push({
            testId,
            componentId,
            value,
            min,
            max,
            unit: MODE06_UNITS[testId] ?? 'count',
            passed: value >= min && value <= max,
        });
    }
    return results;
}

// --- Mode 09: VIN and calibration IDs ---

/**
 * Splits scrubbed Mode 09 bytes into one segment per `49 <pid>` header.
 * Each segment holds the bytes after its header, up to the next header.
 */
function splitMode09Segments(bytes: readonly number[], pid: number): number[][] {
    const segments: number[][] = [];
    let current: number[] | null = null;
    for (let index = 0; index < bytes.length; index += 1) {
        if (index + 1 < bytes.length && bytes[index] === 0x49 && bytes[index + 1] === pid) {
            if (current) segments.push(current);
            current = [];
            index += 1;
            continue;
        }
        if (current) current.push(bytes[index] as number);
    }
    if (current) segments.push(current);
    return segments;
}

/**
 * Drops a leading message-count byte (0x01) from a Mode 09 segment: the
 * first frame carries how many items follow, and it is not part of the
 * value itself.
 */
function dropCountByte(segment: readonly number[]): number[] {
    return segment.length > 0 && segment[0] === 0x01 ? segment.slice(1) : [...segment];
}

/** Parses a `0902` VIN reply; returns null when the car reports no VIN. */
export function parseVinResponse(raw: string): string | null {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return null;
    const segments = splitMode09Segments(bytes, 0x02);
    if (segments.length === 0) return null;
    const vinBytes = dropCountByte(segments[0] as number[]).slice(0, 17);
    const vin = String.fromCharCode(...vinBytes);
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return null;
    return vin;
}

/** Parses a `0904` calibration-ID reply into one ASCII string per message. */
export function parseCalibrationIdResponse(raw: string): string[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    return splitMode09Segments(bytes, 0x04)
        .map((segment) => {
            const ascii = dropCountByte(segment).filter((byte) => byte >= 0x20 && byte <= 0x7e);
            return String.fromCharCode(...ascii).trim();
        })
        .filter((id) => id.length > 0);
}

/** Parses a `0906` calibration-verification-number reply into hex strings, one per message. */
export function parseCalibrationVerificationResponse(raw: string): string[] {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return [];
    return splitMode09Segments(bytes, 0x06)
        .map((segment) => dropCountByte(segment))
        .filter((segment) => segment.length >= 4)
        .map((segment) =>
            (segment.slice(0, 4) as number[])
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')
                .toUpperCase(),
        );
}

// --- Mode 02: freeze frame ---

/** Parses a `02 02` reply into the DTC that triggered the freeze frame; null means no snapshot is stored. */
export function parseFreezeFrameDtcResponse(raw: string): string | null {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return null;
    const data = requireMode(bytes, 2, 'freeze frame DTC');
    if (data.length < 3 || data[0] !== 0x02) return null;
    const codes = decodeDtcBytes(data.slice(1, 3));
    return codes[0] ?? null;
}

/** Parses one Mode 02 PID block (`42 <pid> <bytes>`) into a reading. */
export function parseFreezeFramePidResponse(raw: string, capturedAt: string): ObdPidReading | null {
    const { bytes, noData } = scrubElm327Response(raw);
    if (noData) return null;
    if (bytes.length < 2 || bytes[0] !== 0x42) {
        throw new ObdError('invalid-response', 'Expected a Mode 02 response (0x42) for freeze frame data.');
    }
    const pid = (bytes[1] as number).toString(16).padStart(2, '0').toUpperCase();
    const decoded = decodePidValue(pid, bytes.slice(2));
    if (!decoded) return null;
    return { pid, label: decoded.label, value: decoded.value, unit: decoded.unit, capturedAt };
}

/** Validates a two-hex-digit PID string at the boundary, before it is sent to the car. */
export function assertPid(pid: string): void {
    if (!HEX_PAIR.test(pid.toUpperCase())) {
        throw new ObdError('invalid-response', `Not a Mode 01 PID: '${pid}'`);
    }
}
