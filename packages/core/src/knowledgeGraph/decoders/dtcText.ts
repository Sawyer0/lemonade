import { GENERIC_DTC_DESCRIPTIONS } from '../../dtc/descriptions';
import { parseDtc } from '../../dtc/parser';
import type { ParseDtcResult } from '../../dtc/types';

// --- DTC text (LM-38) ---
// DTC descriptions come only from the generic-descriptions table already
// in packages/core/src/dtc/descriptions.ts. The dtc-database SQLite
// (Wal33D/dtc-database) is NOT vendored: its 28,220+ descriptions include
// 9,415 generic SAE J2012 definitions, and J2012 text is copyrighted by
// SAE, so an MIT license on the container does not license the text
// inside it. A manufacturer-specific code, or a generic code with no
// entry in the table, gets no description at all — never an invented one.

export interface DtcText {
    code: string;
    system: string;
    systemName: string;
    generic: boolean;
    subsystem: string;
    /** Null when the code is manufacturer-specific or has no table entry. */
    description: string | null;
}

export type DescribeDtcResult =
    { ok: true; text: DtcText } | { ok: false; failure: { raw: string; normalized: string; reason: string } };

/**
 * Describes one raw code: parses it with the DTC parser, then looks up
 * its generic description. Invalid codes fail with the parser's reason.
 */
export function describeDtc(raw: string): DescribeDtcResult {
    const parsed: ParseDtcResult = parseDtc(raw);
    if (!parsed.ok) {
        return { ok: false, failure: parsed.failure };
    }
    const { code, system, systemName, generic, subsystem } = parsed.parsed;
    return {
        ok: true,
        text: {
            code,
            system,
            systemName,
            generic,
            subsystem,
            description: generic ? (GENERIC_DTC_DESCRIPTIONS[code] ?? null) : null,
        },
    };
}

/** The generic description for one canonical code, or null when there is none to give. */
export function genericDescription(code: string): string | null {
    return GENERIC_DTC_DESCRIPTIONS[code] ?? null;
}
