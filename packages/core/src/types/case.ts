import { z } from 'zod';

// --- Case aggregate ---
// A case is the long-lived record of one vehicle's problem. One case can span
// multiple sessions and days; sessions attach to it, and every fact about the
// diagnosis is appended to its evidence ledger below. Nothing is edited: a
// mistake is fixed by appending a `correction` entry that references the
// original.
export const CaseStatusSchema = z.enum(['open', 'closed']);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const CaseSchema = z.object({
    id: z.string().uuid(),
    vehicleId: z.string().min(1),
    userId: z.string().min(1),
    status: CaseStatusSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
});
export type Case = z.infer<typeof CaseSchema>;

export const CreateCaseInputSchema = z.object({
    vehicleId: z.string().min(1),
    userId: z.string().min(1),
});
export type CreateCaseInput = z.infer<typeof CreateCaseInputSchema>;

// --- Ledger events ---
// Each ledger entry is one typed event. `who` is a user uid or an agent id,
// `source` is where the evidence came from, and `payload` carries the
// event's own typed content. Photos and frames live in object storage; the
// ledger stores their hash and a reference, never the bytes.
export const LedgerEventTypeSchema = z.enum([
    'vin_decoded',
    'dtc_read',
    'observation',
    'frame_captured',
    'test_result',
    'hypothesis',
    'safety_stop',
    'outcome',
    'correction',
]);
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

export const LedgerActorSchema = z.object({
    kind: z.enum(['user', 'agent']),
    id: z.string().min(1),
});
export type LedgerActor = z.infer<typeof LedgerActorSchema>;

export const LedgerSourceSchema = z.enum(['tech', 'glasses', 'OBD', 'model', 'NHTSA']);
export type LedgerSource = z.infer<typeof LedgerSourceSchema>;

export const MediaReferenceSchema = z.object({
    storageUri: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
});
export type MediaReference = z.infer<typeof MediaReferenceSchema>;

export const VinDecodedPayloadSchema = z.object({
    vin: z.string().length(17),
    year: z.number().int().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    trim: z.string().optional(),
});
export type VinDecodedPayload = z.infer<typeof VinDecodedPayloadSchema>;

export const DtcReadPayloadSchema = z.object({
    codes: z.array(z.string().min(1)).min(1),
    freezeFrame: z.record(z.unknown()).optional(),
});
export type DtcReadPayload = z.infer<typeof DtcReadPayloadSchema>;

export const ObservationPayloadSchema = z.object({
    text: z.string().min(1),
    media: MediaReferenceSchema.optional(),
});
export type ObservationPayload = z.infer<typeof ObservationPayloadSchema>;

export const FrameCapturedPayloadSchema = z.object({
    media: MediaReferenceSchema,
    capturedAt: z.string().min(1).optional(),
});
export type FrameCapturedPayload = z.infer<typeof FrameCapturedPayloadSchema>;

export const TestResultPayloadSchema = z.object({
    testName: z.string().min(1),
    result: z.enum(['pass', 'fail', 'inconclusive']),
    measuredValue: z.number().optional(),
    unit: z.string().optional(),
    notes: z.string().optional(),
});
export type TestResultPayload = z.infer<typeof TestResultPayloadSchema>;

export const HypothesisPayloadSchema = z.object({
    text: z.string().min(1),
    confidence: z.number().min(0).max(1),
});
export type HypothesisPayload = z.infer<typeof HypothesisPayloadSchema>;

export const SafetyStopPayloadSchema = z.object({
    reason: z.string().min(1),
    hazard: z.string().optional(),
});
export type SafetyStopPayload = z.infer<typeof SafetyStopPayloadSchema>;

export const OutcomePayloadSchema = z.object({
    resolution: z.string().min(1),
    repaired: z.boolean().optional(),
    notes: z.string().optional(),
});
export type OutcomePayload = z.infer<typeof OutcomePayloadSchema>;

export const CorrectionPayloadSchema = z.object({
    text: z.string().min(1),
});
export type CorrectionPayload = z.infer<typeof CorrectionPayloadSchema>;

export const LedgerEntryPayloadSchemas = {
    vin_decoded: VinDecodedPayloadSchema,
    dtc_read: DtcReadPayloadSchema,
    observation: ObservationPayloadSchema,
    frame_captured: FrameCapturedPayloadSchema,
    test_result: TestResultPayloadSchema,
    hypothesis: HypothesisPayloadSchema,
    safety_stop: SafetyStopPayloadSchema,
    outcome: OutcomePayloadSchema,
    correction: CorrectionPayloadSchema,
} as const;

const LedgerEntryBaseSchema = z.object({
    id: z.string().uuid(),
    caseId: z.string().uuid(),
    sequence: z.number().int().min(1),
    actor: LedgerActorSchema,
    source: LedgerSourceSchema,
    occurredAt: z.date(),
    previousHash: z.string().regex(/^[0-9a-f]{64}$/, 'previousHash must be 64 lowercase hex characters'),
    entryHash: z.string().regex(/^[0-9a-f]{64}$/, 'entryHash must be 64 lowercase hex characters'),
    correctsEntryId: z.string().uuid().optional(),
    createdAt: z.date(),
});

export const LedgerEntrySchema = z
    .discriminatedUnion('type', [
        LedgerEntryBaseSchema.extend({ type: z.literal('vin_decoded'), payload: VinDecodedPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('dtc_read'), payload: DtcReadPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('observation'), payload: ObservationPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('frame_captured'), payload: FrameCapturedPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('test_result'), payload: TestResultPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('hypothesis'), payload: HypothesisPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('safety_stop'), payload: SafetyStopPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('outcome'), payload: OutcomePayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('correction'), payload: CorrectionPayloadSchema }),
    ])
    .superRefine((entry, ctx) => {
        if (entry.type === 'correction' && !entry.correctsEntryId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'A correction entry must reference the original entry',
                path: ['correctsEntryId'],
            });
        }
    });
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// Append input: the same per-type payloads, without the ledger's own fields.
// Only a `correction` carries `correctsEntryId`; the strict objects reject it
// on every other type.
const AppendEntryBaseSchema = z.object({
    actor: LedgerActorSchema,
    source: LedgerSourceSchema,
    occurredAt: z.date(),
});

export const AppendLedgerEntryInputSchema = z.discriminatedUnion('type', [
    AppendEntryBaseSchema.extend({ type: z.literal('vin_decoded'), payload: VinDecodedPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('dtc_read'), payload: DtcReadPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('observation'), payload: ObservationPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('frame_captured'), payload: FrameCapturedPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('test_result'), payload: TestResultPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('hypothesis'), payload: HypothesisPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('safety_stop'), payload: SafetyStopPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('outcome'), payload: OutcomePayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({
        type: z.literal('correction'),
        payload: CorrectionPayloadSchema,
        correctsEntryId: z.string().uuid(),
    }).strict(),
]);
export type AppendLedgerEntryInput = z.infer<typeof AppendLedgerEntryInputSchema>;

// --- Hash chain ---
// The chain is the audit spine: each entry's hash covers its content plus the
// previous entry's hash, so any edit to an earlier entry breaks every hash
// after it. Hashing is injected (LedgerHasher) so this module stays free of
// Node-only imports — the mobile app imports @lemonade/core too.
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

export interface LedgerHasher {
    digestHex(data: string): string;
}

export interface LedgerEntryHashInput {
    caseId: string;
    sequence: number;
    type: LedgerEventType;
    actor: LedgerActor;
    source: LedgerSource;
    occurredAt: Date;
    payload: unknown;
    previousHash: string;
    correctsEntryId?: string;
}

/** Deterministic JSON: object keys sorted recursively, dates as ISO strings. */
export function canonicalJson(value: unknown): string {
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function computeLedgerEntryHash(hasher: LedgerHasher, input: LedgerEntryHashInput): string {
    // Only the content fields are hashed, never the entry's own id, stored
    // hash, or createdAt — and an absent correctsEntryId must hash exactly
    // like it was never there, so append-time and verify-time agree.
    const { correctsEntryId, ...rest } = input;
    const hashable = correctsEntryId === undefined ? rest : { ...rest, correctsEntryId };
    return hasher.digestHex(canonicalJson(hashable));
}

/**
 * Verifies a full chain: sequences run 1..n with no gaps, each entry's
 * previousHash is the hash of the entry before it, and every stored hash
 * recomputes from the entry's content. Returns false on any mismatch.
 */
export function verifyLedgerChain(hasher: LedgerHasher, entries: LedgerEntry[]): boolean {
    const ordered = [...entries].sort((a, b) => a.sequence - b.sequence);
    let expectedPrevious = LEDGER_GENESIS_HASH;
    for (const [index, entry] of ordered.entries()) {
        if (entry.sequence !== index + 1) {
            return false;
        }
        if (entry.previousHash !== expectedPrevious) {
            return false;
        }
        const recomputed = computeLedgerEntryHash(hasher, {
            caseId: entry.caseId,
            sequence: entry.sequence,
            type: entry.type,
            actor: entry.actor,
            source: entry.source,
            occurredAt: entry.occurredAt,
            payload: entry.payload,
            previousHash: entry.previousHash,
            ...(entry.correctsEntryId ? { correctsEntryId: entry.correctsEntryId } : {}),
        });
        if (recomputed !== entry.entryHash) {
            return false;
        }
        expectedPrevious = entry.entryHash;
    }
    return true;
}
