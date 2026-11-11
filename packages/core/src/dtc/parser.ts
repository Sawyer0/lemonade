import { GENERIC_DTC_DESCRIPTIONS, describeSubsystem, isGenericDtc } from './descriptions';
import {
    DTC_SYSTEM_NAMES,
    ParsedDtcSchema,
    type DtcSystem,
    type ParseDtcBatchResult,
    type ParseDtcResult,
    type ParsedDtc,
} from './types';

const HEX_DIGIT = /^[0-9A-F]$/;

// Letters a scan-tool photo OCR commonly reads in place of a digit. Only
// applied to the four digit positions, never to the system letter.
const OCR_DIGIT_REPLACEMENTS: Readonly<Record<string, string>> = { O: '0', I: '1', L: '1', S: '5' };

/**
 * Normalises a code as typed, spoken-transcribed or OCR'd from a scan tool
 * screen: uppercases, drops a leading "DTC" label, strips spaces, dashes,
 * dots and underscores, and repairs OCR lookalike letters in digit
 * positions. The result is the canonical form a valid code must match.
 */
export function normalizeDtcInput(raw: string): string {
    let cleaned = raw.trim().toUpperCase();
    if (cleaned.startsWith('DTC')) {
        cleaned = cleaned.slice(3);
    }
    cleaned = cleaned.replace(/[\s\-._]/g, '');
    return cleaned
        .split('')
        .map((character, index) => {
            if (index === 0) return character;
            return OCR_DIGIT_REPLACEMENTS[character] ?? character;
        })
        .join('');
}

function isDtcSystemLetter(character: string): character is DtcSystem {
    return character === 'P' || character === 'B' || character === 'C' || character === 'U';
}

/**
 * Parses one raw code deterministically. Valid codes become a structured
 * object; anything else is rejected with a reason, never guessed at.
 */
export function parseDtc(raw: string): ParseDtcResult {
    const normalized = normalizeDtcInput(raw);
    const reject = (reason: string): ParseDtcResult => ({ ok: false, failure: { raw, normalized, reason } });

    if (normalized.length === 0) {
        return reject('Empty DTC: expected a system letter (P, B, C or U) followed by 4 digits');
    }
    if (normalized.length !== 5) {
        return reject(
            `Expected 5 characters (a system letter plus 4 digits), got ${normalized.length}: '${normalized}'`,
        );
    }
    const systemLetter = normalized[0];
    if (!isDtcSystemLetter(systemLetter)) {
        return reject(`System letter must be P, B, C or U, got '${systemLetter}'`);
    }
    // SAE J2012 / ISO 15031-6 §5.1: the designator (second character) is
    // only 0-3 (B0-B3, C0-C3, P0-P3, U0-U3). 4-F are valid hex digits but
    // not valid designators, so they are rejected here, not by the hex
    // check below.
    const designator = normalized[1];
    if (designator < '0' || designator > '3') {
        return reject(
            `Second character (designator) must be 0-3 (B0-B3, C0-C3, P0-P3, U0-U3 per SAE J2012), got '${designator}'`,
        );
    }
    const digits = normalized.slice(1);
    if (![...digits].every((character) => HEX_DIGIT.test(character))) {
        return reject(`Characters after the system letter must be hexadecimal digits (0-9, A-F): '${normalized}'`);
    }

    const generic = isGenericDtc(systemLetter, digits[0], digits[1]);
    const parsed: ParsedDtc = {
        code: normalized,
        system: systemLetter,
        systemName: DTC_SYSTEM_NAMES[systemLetter],
        generic,
        subsystemDigit: digits[1],
        subsystem: describeSubsystem(systemLetter, digits[1]),
        description: generic ? (GENERIC_DTC_DESCRIPTIONS[normalized] ?? null) : null,
    };
    return { ok: true, parsed: ParsedDtcSchema.parse(parsed) };
}

/**
 * Parses a batch of raw codes. Valid codes are deduplicated by canonical
 * code in first-seen order; every rejected input is reported with its
 * reason. Nothing is silently dropped.
 */
export function parseDtcBatch(rawCodes: readonly string[]): ParseDtcBatchResult {
    const parsed: ParsedDtc[] = [];
    const failures: ParseDtcBatchResult['failures'] = [];
    const seen = new Set<string>();
    for (const raw of rawCodes) {
        const result = parseDtc(raw);
        if (!result.ok) {
            failures.push(result.failure);
            continue;
        }
        if (seen.has(result.parsed.code)) {
            continue;
        }
        seen.add(result.parsed.code);
        parsed.push(result.parsed);
    }
    return { parsed, failures };
}
