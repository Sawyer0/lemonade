import { z } from 'zod';

// --- SAE J2012 DTC structure ---
// A DTC is one system letter (P/B/C/U), a designator digit 0-3, then three
// hexadecimal characters. The designator says whether the code is SAE
// generic or manufacturer-specific (the split is code-dependent for P3xxx),
// the third character identifies the subsystem, and the last two identify
// the fault.
export const DtcSystemSchema = z.enum(['P', 'B', 'C', 'U']);
export type DtcSystem = z.infer<typeof DtcSystemSchema>;

export const DTC_SYSTEM_NAMES: Record<DtcSystem, string> = {
    P: 'Powertrain',
    B: 'Body',
    C: 'Chassis',
    U: 'Network',
};

export const ParsedDtcSchema = z.object({
    code: z
        .string()
        .regex(/^[PBCU][0-3][0-9A-F]{3}$/, 'code must be a system letter plus designator 0-3 plus 3 hex digits'),
    system: DtcSystemSchema,
    systemName: z.string().min(1),
    generic: z.boolean(),
    subsystemDigit: z.string().length(1),
    subsystem: z.string().min(1),
    // Generic description from the SAE table, or null when the code has no
    // table entry. Manufacturer-specific codes never get a description here:
    // their meaning belongs to the manufacturer, and this module never
    // invents one.
    description: z.string().nullable(),
});
export type ParsedDtc = z.infer<typeof ParsedDtcSchema>;

export const DtcParseFailureSchema = z.object({
    raw: z.string(),
    normalized: z.string(),
    reason: z.string().min(1),
});
export type DtcParseFailure = z.infer<typeof DtcParseFailureSchema>;

export type ParseDtcResult = { ok: true; parsed: ParsedDtc } | { ok: false; failure: DtcParseFailure };

export interface ParseDtcBatchResult {
    parsed: ParsedDtc[];
    failures: DtcParseFailure[];
}
