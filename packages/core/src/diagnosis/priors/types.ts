// Field-fix priors (LM-33): the typed contract for "for this vehicle and
// these codes, how often was each cause the confirmed fix".
//
// A prior is keyed by (make, model, year range, engine, DTC set, mileage
// band). `n` is how many times the cause was the confirmed fix, `q` is the
// raw share of observations, `pi` is the smoothed probability a diagnostic
// loop should rank on, and `sources` is the provenance: which ingestion
// source each observation came from. Nothing here invents a count: every
// observation is traced to a source whose license is recorded in
// licenses.ts, and Lemonade's own outcomes only count once an expert has
// validated them (LM-35 owns that workflow; this module only consumes the
// attestation in ExpertValidation).
import { z } from 'zod';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';

// --- Sources ---
// One source per ingestion feed. NHTSA feeds are split because their
// license and shape differ per file, not because the code treats them
// differently.
export const PriorSourceSchema = z.enum([
    'nhtsa-complaints',
    'nhtsa-recalls',
    'nhtsa-tsb',
    'autorepairbench',
    'repair-order',
    'lemonade-ledger',
]);
export type PriorSource = z.infer<typeof PriorSourceSchema>;

// --- Vehicle key ---
export const MileageBandSchema = z.enum(['0-30k', '30-60k', '60-100k', '100-150k', '150k+']);
export type MileageBand = z.infer<typeof MileageBandSchema>;

export const MILEAGE_BANDS: ReadonlyArray<MileageBand> = [
    '0-30k',
    '30-60k',
    '60-100k',
    '100-150k',
    '150k+',
];

/** Maps an odometer reading in miles to its band. Throws on a negative or non-finite reading. */
export function mileageBandFor(miles: number): MileageBand {
    if (!Number.isFinite(miles) || miles < 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Mileage must be a non-negative number');
    }
    if (miles < 30000) return '0-30k';
    if (miles < 60000) return '30-60k';
    if (miles < 100000) return '60-100k';
    if (miles < 150000) return '100-150k';
    return '150k+';
}

// A stored key may use '*' for make or model: AutoRepairBench is a
// BMW-centered benchmark with no per-record model, so its seed counts are
// keyed make 'BMW', model '*'. A query never uses '*'; matching treats a
// stored '*' as "any".
export const VehicleKeySchema = z
    .object({
        make: z.string().min(1),
        model: z.string().min(1),
        yearFrom: z.number().int().min(1900).max(2100),
        yearTo: z.number().int().min(1900).max(2100),
        engine: z.string().min(1).optional(),
    })
    .refine((key) => key.yearFrom <= key.yearTo, {
        message: 'yearFrom must not be after yearTo',
    });
export type VehicleKey = z.infer<typeof VehicleKeySchema>;

// --- Case facts (the query) ---
// SAE J2012 OBD-II code: a system letter, a designator 0-3, then three hex
// digits. This is the same shape packages/core/src/dtc enforces; bench DTCs
// (BMW ECU codes such as 5D0C) are NOT OBD codes and never pass through
// this schema — they live in FixCount.dtcs, which holds normalized code
// strings of either shape.
export const ObdDtcSchema = z.string().regex(/^[PBCU][0-3][0-9A-F]{3}$/, 'DTC must be an SAE J2012 code');

export const CaseFactsSchema = z.object({
    vehicle: VehicleKeySchema,
    dtcs: z.array(ObdDtcSchema).min(1),
    mileageBand: MileageBandSchema.optional(),
});
export type CaseFacts = z.infer<typeof CaseFactsSchema>;

/**
 * Normalises raw case facts: make/model trimmed and uppercased, DTCs
 * uppercased, deduplicated, and sorted, so the same facts always key the
 * same way. Throws an AppError on an invalid code instead of guessing.
 */
export function normalizeCaseFacts(input: unknown): CaseFacts {
    const parsed = CaseFactsSchema.safeParse(input);
    if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid case facts: ${parsed.error.message}`);
    }
    const facts = parsed.data;
    return {
        vehicle: {
            make: facts.vehicle.make.trim().toUpperCase(),
            model: facts.vehicle.model.trim().toUpperCase(),
            yearFrom: facts.vehicle.yearFrom,
            yearTo: facts.vehicle.yearTo,
            ...(facts.vehicle.engine ? { engine: facts.vehicle.engine.trim() } : {}),
        },
        dtcs: [...new Set(facts.dtcs.map((code) => code.trim().toUpperCase()))].sort(),
        ...(facts.mileageBand ? { mileageBand: facts.mileageBand } : {}),
    };
}

/** Normalises one stored code string (OBD or bench-native): uppercase, no spaces. */
export function normalizeStoredCode(code: string): string {
    return code.trim().toUpperCase().replace(/\s+/g, '');
}

// --- Fix counts (the stored observations) ---
// `dtcs` is empty for vehicle-level observations: NHTSA complaints, recalls,
// and TSB summaries carry a component but no DTC, so they raise the prior
// for that vehicle whatever the codes are. A non-empty set must be a subset
// of the query's codes to match.
export const FixCountSchema = z.object({
    vehicle: VehicleKeySchema,
    dtcs: z.array(z.string().min(1)),
    mileageBand: MileageBandSchema.optional(),
    hypothesis: z.string().min(1),
    observationCount: z.number().int().min(0),
    sourceCounts: z.record(PriorSourceSchema, z.number().int().min(0)),
});
export type FixCount = z.infer<typeof FixCountSchema>;

/** Normalises a stored count: vehicle key and hypothesis trimmed/cased, DTCs sorted and deduplicated. */
export function normalizeFixCount(input: unknown): FixCount {
    const parsed = FixCountSchema.safeParse(input);
    if (!parsed.success) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Invalid fix count: ${parsed.error.message}`);
    }
    const count = parsed.data;
    return {
        vehicle: {
            make: count.vehicle.make.trim().toUpperCase(),
            model: count.vehicle.model.trim().toUpperCase(),
            yearFrom: count.vehicle.yearFrom,
            yearTo: count.vehicle.yearTo,
            ...(count.vehicle.engine ? { engine: count.vehicle.engine.trim() } : {}),
        },
        dtcs: [...new Set(count.dtcs.map(normalizeStoredCode))].sort(),
        ...(count.mileageBand ? { mileageBand: count.mileageBand } : {}),
        hypothesis: count.hypothesis.trim().toLowerCase(),
        observationCount: count.observationCount,
        sourceCounts: count.sourceCounts,
    };
}

// --- Prior output ---
export const PriorHypothesisSchema = z.object({
    hypothesis: z.string().min(1),
    n: z.number().int().min(0),
    q: z.number().min(0).max(1),
    pi: z.number().min(0).max(1),
    sources: z.array(
        z.object({
            source: PriorSourceSchema,
            observationCount: z.number().int().min(0),
        }),
    ),
});
export type PriorHypothesis = z.infer<typeof PriorHypothesisSchema>;

export const PriorQueryResultSchema = z.object({
    facts: CaseFactsSchema,
    hypotheses: z.array(PriorHypothesisSchema),
    totalObservations: z.number().int().min(0),
});
export type PriorQueryResult = z.infer<typeof PriorQueryResultSchema>;

// --- Expert validation (the LM-35 gate) ---
// Lemonade's own confirmed outcomes count toward priors only when an expert
// has validated them. LM-35 (#37) owns the network and escalation workflow
// that produces these attestations; this module only consumes one: the
// validator's id and the time they validated. An outcome with no
// attestation is skipped, never counted.
export const ExpertValidationSchema = z.object({
    validatorId: z.string().min(1),
    validatedAt: z.date(),
    note: z.string().min(1).optional(),
});
export type ExpertValidation = z.infer<typeof ExpertValidationSchema>;

// --- Source licenses ---
// Every ingestion source carries a recorded license check. `licenseStatus`
// is the finding; `approvedForProduction` is what the code enforces — a
// source that is not approved may seed priors and feed evals but must never
// feed a production prior. See licenses.ts for the recorded checks.
export const SourceLicenseStatusSchema = z.enum(['public-domain', 'open', 'research-use-only', 'shop-owned']);
export type SourceLicenseStatus = z.infer<typeof SourceLicenseStatusSchema>;

export const SourceLicenseSchema = z.object({
    source: PriorSourceSchema,
    license: z.string().min(1),
    licenseStatus: SourceLicenseStatusSchema,
    approvedForProduction: z.boolean(),
    checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'checkedOn must be a YYYY-MM-DD date'),
    evidence: z.string().min(1),
    notes: z.string().min(1),
});
export type SourceLicense = z.infer<typeof SourceLicenseSchema>;
