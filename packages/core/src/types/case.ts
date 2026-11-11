import { z } from 'zod';
import {
    CriterionMetPayloadSchema,
    GoalAmendedPayloadSchema,
    GoalSetPayloadSchema,
    GoalStatusChangedPayloadSchema,
} from '../goal/goalSchema';
import {
    GuidedObdTestOutcomeSchema,
    ObdFaultWindowSchema,
    ObdScanResultSchema,
    VerifyFixResultSchema,
} from '../obd/types';

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
    // Optimistic-concurrency counter (LM-17). Every ledger append and every
    // committed run advances it by one; a run writes with the version it
    // read, and a stale version refuses the write.
    version: z.number().int().min(1),
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
    'transcript',
    // LM-25 goal events: the goal is set, amended, or changes status, and
    // each criterion met is recorded as its own entry. These are audit
    // records; the evaluator proves a criterion from the underlying evidence,
    // never from an audit entry (and never from a `correction`).
    'goal_set',
    'goal_amended',
    'criterion_met',
    'goal_status_changed',
    // LM-03: typed OBD readings. `obd_scan` is the one-tap full scan
    // (codes in every state, freeze frame, Mode 06, readiness, VIN);
    // `obd_fault_window` is a saved 60 s-before / 15 s-after window;
    // `guided_test` is a guided-test outcome against its expected range;
    // `verify_fix` is the clear-codes / drive-cycle / rescan verdict.
    'obd_scan',
    'obd_fault_window',
    'guided_test',
    'verify_fix',
]);
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

export const LedgerActorSchema = z.object({
    kind: z.enum(['user', 'agent']),
    id: z.string().min(1),
});
export type LedgerActor = z.infer<typeof LedgerActorSchema>;

// 'sandbox' is a test run in the sandbox (LM-25): deterministic, model-free
// evidence, admissible as proof. 'model' stays a source an entry can carry,
// but it is never admissible as proof — see AdmissibleSourcesSchema.
export const LedgerSourceSchema = z.enum(['tech', 'glasses', 'OBD', 'sandbox', 'model', 'NHTSA']);
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
    /**
     * A still in the ledger is always full resolution: the talker's low-res
     * frames are never evidence, so the schema only accepts 'high'.
     */
    resolution: z.literal('high'),
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

export const OutcomePayloadSchema = z
    .object({
        repairPerformed: z.string().min(1),
        partsReplaced: z.array(z.string().min(1)).default([]),
        codesCleared: z.boolean(),
        symptomGone: z.boolean(),
        retestPassed: z.boolean(),
        confirmed: z.boolean(),
        notes: z.string().optional(),
    })
    .superRefine((outcome, ctx) => {
        // Confirmed means the fault is proven fixed: codes cleared, symptom
        // gone, and re-test passed. All three must hold; anything less closes
        // the case as unconfirmed.
        if (outcome.confirmed && !(outcome.codesCleared && outcome.symptomGone && outcome.retestPassed)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'A confirmed outcome requires codes cleared, symptom gone, and re-test passed',
                path: ['confirmed'],
            });
        }
    });
export type OutcomePayload = z.infer<typeof OutcomePayloadSchema>;

export const CorrectionPayloadSchema = z.object({
    text: z.string().min(1),
});
export type CorrectionPayload = z.infer<typeof CorrectionPayloadSchema>;

// One turn of a live voice session, as spoken or heard. `provider` is the
// voice provider id (LM-39: gemini, grok, or cascade) so a transcript can be
// traced back to the model that produced it; the audio itself is never stored.
export const TranscriptPayloadSchema = z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1),
    provider: z.string().min(1),
});
export type TranscriptPayload = z.infer<typeof TranscriptPayloadSchema>;

// LM-03: OBD payloads are the scan / window / guided-test / verify-fix
// schemas from the OBD module, reused verbatim so the ledger and the
// adapter can never disagree about the shape of a reading.
export const ObdScanPayloadSchema = ObdScanResultSchema;
export type ObdScanPayload = z.infer<typeof ObdScanPayloadSchema>;
export const ObdFaultWindowPayloadSchema = ObdFaultWindowSchema;
export type ObdFaultWindowPayload = z.infer<typeof ObdFaultWindowPayloadSchema>;
export const GuidedTestPayloadSchema = GuidedObdTestOutcomeSchema;
export type GuidedTestPayload = z.infer<typeof GuidedTestPayloadSchema>;
export const VerifyFixPayloadSchema = VerifyFixResultSchema;
export type VerifyFixPayload = z.infer<typeof VerifyFixPayloadSchema>;

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
        LedgerEntryBaseSchema.extend({ type: z.literal('transcript'), payload: TranscriptPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('goal_set'), payload: GoalSetPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('goal_amended'), payload: GoalAmendedPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('criterion_met'), payload: CriterionMetPayloadSchema }),
        LedgerEntryBaseSchema.extend({
            type: z.literal('goal_status_changed'),
            payload: GoalStatusChangedPayloadSchema,
        }),
        LedgerEntryBaseSchema.extend({ type: z.literal('obd_scan'), payload: ObdScanPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('obd_fault_window'), payload: ObdFaultWindowPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('guided_test'), payload: GuidedTestPayloadSchema }),
        LedgerEntryBaseSchema.extend({ type: z.literal('verify_fix'), payload: VerifyFixPayloadSchema }),
    ])
    .superRefine((entry, ctx) => {
        if (entry.type === 'correction' && !entry.correctsEntryId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'A correction entry must reference the original entry',
                path: ['correctsEntryId'],
            });
        }
        if (entry.type !== 'correction' && entry.correctsEntryId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Only a correction entry may reference another entry',
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
    AppendEntryBaseSchema.extend({ type: z.literal('transcript'), payload: TranscriptPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('goal_set'), payload: GoalSetPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('goal_amended'), payload: GoalAmendedPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('criterion_met'), payload: CriterionMetPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({
        type: z.literal('goal_status_changed'),
        payload: GoalStatusChangedPayloadSchema,
    }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('obd_scan'), payload: ObdScanPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({
        type: z.literal('obd_fault_window'),
        payload: ObdFaultWindowPayloadSchema,
    }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('guided_test'), payload: GuidedTestPayloadSchema }).strict(),
    AppendEntryBaseSchema.extend({ type: z.literal('verify_fix'), payload: VerifyFixPayloadSchema }).strict(),
]);
export type AppendLedgerEntryInput = z.infer<typeof AppendLedgerEntryInputSchema>;

// LM-03: the OBD evidence a session can append after the scan itself:
// a guided-test outcome, a saved fault window, or a verify-fix verdict.
// The scan has its own method (recordObdScan) because it also writes the
// session's obdCodes; these three only touch the ledger. The service adds
// the actor, source and occurredAt when it builds the ledger entry.
export type ObdLedgerEventInput =
    | { type: 'guided_test'; payload: GuidedTestPayload }
    | { type: 'obd_fault_window'; payload: ObdFaultWindowPayload }
    | { type: 'verify_fix'; payload: VerifyFixPayload };

// --- Hash chain ---
// The chain is the audit spine: each entry's hash covers its content plus the
// previous entry's hash, so any edit to an earlier entry breaks every hash
// after it. Hashing is injected (LedgerHasher) so this module stays free of
// Node-only imports — the mobile app imports @lemonade/core too.
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

export interface LedgerHasher {
    digestHex(content: string): string;
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
    // JSONB drops keys whose value is explicitly `undefined` on storage, so
    // the hash must not depend on them either — otherwise an append-time hash
    // and a verify-time hash of the same entry would disagree.
    return hasher.digestHex(canonicalJson(stripUndefined(hashable)));
}

/**
 * Drops keys whose value is explicitly `undefined`, recursively. Dates pass
 * through untouched; everything else is rebuilt without undefined values.
 */
function stripUndefined(value: unknown): unknown {
    if (value instanceof Date) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(stripUndefined);
    }
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const cleaned: Record<string, unknown> = {};
        for (const [key, entryValue] of Object.entries(record)) {
            if (entryValue !== undefined) {
                cleaned[key] = stripUndefined(entryValue);
            }
        }
        return cleaned;
    }
    return value;
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
