// --- J1939 DM1 decoding (LM-38) ---
// Diagnostic Message 1, PGN 65226 (SAE J1939-73): active diagnostic
// trouble codes for heavy equipment. Each DTC is 4 bytes: SPN (19 bits),
// FMI (5 bits), occurrence count (7 bits), conversion method (1 bit).
// SPN names live in the licensed SAE J1939 Digital Annex, so no SPN name
// table ships: `spnName` stays null until a licensed annex is acquired.
// The FMI 0-31 table below is our own table of the failure-mode meanings
// from SAE J1939-73; no SAE text is copied in.

/** PGN for DM1 (active diagnostic trouble codes). */
export const DM1_PGN = 65226;

/** A lamp's state in the DM1 lamp-status bytes. */
export const DM1_LAMP_STATES = ['off', 'on', 'reserved', 'not-available'] as const;
export type Dm1LampState = (typeof DM1_LAMP_STATES)[number];

export interface Dm1LampStatus {
    malfunctionIndicator: Dm1LampState;
    redStop: Dm1LampState;
    amberWarning: Dm1LampState;
    protect: Dm1LampState;
}

export interface Dm1Dtc {
    /** Suspect parameter number. */
    spn: number;
    /** Always null: SPN names wait for a licensed SAE Digital Annex. */
    spnName: null;
    /** Failure mode identifier, 0-31. */
    fmi: number;
    fmiMeaning: string;
    /** How many times this fault has occurred. */
    occurrenceCount: number;
    /** 0 = SPN conversion method version 0, 1 = version 1. */
    conversionMethod: number;
}

export interface Dm1Frame {
    lampStatus: Dm1LampStatus;
    dtcs: Dm1Dtc[];
}

export type DecodeDm1Result = { ok: true; frame: Dm1Frame } | { ok: false; failure: { reason: string } };

/** Failure-mode meanings from SAE J1939-73, FMI 0-31. FMI 22-30 are reserved. */
export const FMI_MEANINGS: Readonly<Record<number, string>> = {
    0: 'Data valid but above normal operating range, most severe level',
    1: 'Data valid but below normal operating range, most severe level',
    2: 'Data erratic, intermittent or incorrect',
    3: 'Voltage above normal, or shorted to high source',
    4: 'Voltage below normal, or shorted to low source',
    5: 'Current below normal or open circuit',
    6: 'Current above normal or grounded circuit',
    7: 'Mechanical system not responding or out of adjustment',
    8: 'Abnormal frequency or pulse width or period',
    9: 'Abnormal update rate',
    10: 'Abnormal rate of change',
    11: 'Root cause not known',
    12: 'Bad intelligent device or component',
    13: 'Out of calibration',
    14: 'Special instructions',
    15: 'Data valid but above normal operating range, least severe level',
    16: 'Data valid but above normal operating range, moderately severe level',
    17: 'Data valid but below normal operating range, least severe level',
    18: 'Data valid but below normal operating range, moderately severe level',
    19: 'Received network data in error',
    20: 'Data drifted high',
    21: 'Data drifted low',
    31: 'Condition exists',
};

/** The failure-mode meaning for one FMI, or 'Reserved' for FMI 22-30. */
export function fmiMeaning(fmi: number): string {
    if (!Number.isInteger(fmi) || fmi < 0 || fmi > 31) {
        throw new Error(`FMI must be an integer from 0 to 31, got ${fmi}`);
    }
    return FMI_MEANINGS[fmi] ?? 'Reserved';
}

function lampState(bits: number): Dm1LampState {
    switch (bits) {
        case 0:
            return 'off';
        case 1:
            return 'on';
        case 2:
            return 'reserved';
        default:
            return 'not-available';
    }
}

function decodeDtcSlot(slot: readonly number[]): Dm1Dtc | undefined {
    if (slot.every((byte) => byte === 0xff)) {
        return undefined;
    }
    const byte0 = slot[0] ?? 0;
    const byte1 = slot[1] ?? 0;
    const byte2 = slot[2] ?? 0;
    const byte3 = slot[3] ?? 0;
    const spn = byte0 | (byte1 << 8) | ((byte2 & 0xe0) << 11);
    const fmi = byte2 & 0x1f;
    return {
        spn,
        spnName: null,
        fmi,
        fmiMeaning: fmiMeaning(fmi),
        occurrenceCount: byte3 & 0x7f,
        conversionMethod: (byte3 & 0x80) >> 7,
    };
}

/**
 * Decodes a DM1 payload: 2 lamp-status bytes followed by 4-byte DTC
 * slots. A payload shorter than 6 bytes, or a trailing partial slot that
 * is not 0xFF padding, fails with a reason. All-0xFF slots carry no DTC
 * and are skipped.
 */
export function decodeDm1(payload: readonly number[]): DecodeDm1Result {
    const fail = (reason: string): DecodeDm1Result => ({ ok: false, failure: { reason } });
    if (payload.length < 6) {
        return fail(`DM1 payload is ${payload.length} bytes; it needs at least 2 lamp bytes and one 4-byte DTC`);
    }
    const lampByte = payload[0] ?? 0;
    const frame: Dm1Frame = {
        lampStatus: {
            malfunctionIndicator: lampState((lampByte >> 6) & 0x3),
            redStop: lampState((lampByte >> 4) & 0x3),
            amberWarning: lampState((lampByte >> 2) & 0x3),
            protect: lampState(lampByte & 0x3),
        },
        dtcs: [],
    };
    let offset = 2;
    while (offset < payload.length) {
        const remaining = payload.slice(offset);
        if (remaining.length < 4) {
            if (remaining.every((byte) => byte === 0xff)) {
                break;
            }
            return fail(`DM1 payload ends with ${remaining.length} bytes of a truncated DTC`);
        }
        const dtc = decodeDtcSlot(remaining.slice(0, 4));
        if (dtc !== undefined) {
            frame.dtcs.push(dtc);
        }
        offset += 4;
    }
    return { ok: true, frame };
}
