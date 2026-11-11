import { z } from 'zod';
import { LedgerEventTypeSchema, LedgerSourceSchema as LedgerEventSourceSchema } from './case';
import type { LedgerEventType, LedgerSource as LedgerEventSource } from './case';

/**
 * Memory scopes (LM-31). The ledger view below reuses LM-01's canonical
 * event and source schemas (`types/case.ts`): the event list is settled,
 * not provisional. A `LedgerEventReference` is the minimal view of a ledger
 * event: enough to cite it as evidence for a memory write, without the
 * event's full payload or hash chain.
 */
export { LedgerEventTypeSchema, LedgerEventSourceSchema };
export type { LedgerEventType, LedgerEventSource };

/** Minimal view of a ledger event: enough to cite it as evidence for a memory write. */
export const LedgerEventReferenceSchema = z.object({
    eventId: z.string().min(1),
    caseId: z.string().min(1),
    type: LedgerEventTypeSchema,
    source: LedgerEventSourceSchema,
    createdAt: z.string().datetime(),
    /** Content excerpt, when the caller needs the cited text (voice confirmations, wiki quotes). */
    text: z.string().optional(),
});

export type LedgerEventReference = z.infer<typeof LedgerEventReferenceSchema>;

export const MemoryScopeSchema = z.enum(['tech_profile', 'vehicle_record', 'shop', 'global_priors']);

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const TechFactSchema = z.object({
    factId: z.string().min(1),
    text: z.string().min(1),
    source: z.enum(['voice_confirmation']),
    confirmedAt: z.string().datetime(),
    sourceEventIds: z.array(z.string().min(1)),
});

export type TechFact = z.infer<typeof TechFactSchema>;

export const TechFactChangeSchema = z.object({
    factId: z.string().min(1),
    action: z.enum(['confirmed', 'forgotten', 'corrected']),
    reason: z.string().min(1),
    /** The text a correction replaced, so the audit trail keeps what changed. */
    previousText: z.string().min(1).optional(),
    at: z.string().datetime(),
});

export type TechFactChange = z.infer<typeof TechFactChangeSchema>;

/** Tech profile: about the tech, owned by the shop account, frozen for a session once injected. */
export const TechProfileSchema = z.object({
    techId: z.string().min(1),
    shopId: z.string().min(1),
    skillLevel: z.string().min(1),
    units: z.enum(['metric', 'imperial']),
    toolsOnHand: z.array(z.string().min(1)),
    detailPreference: z.enum(['brief', 'standard', 'detailed']),
    facts: z.array(TechFactSchema),
    changeLog: z.array(TechFactChangeSchema),
    updatedAt: z.string().datetime(),
});

export type TechProfile = z.infer<typeof TechProfileSchema>;

/**
 * Vehicle fact as a claim: it cites the ledger events it comes from, and a
 * replaced fact is superseded rather than left standing.
 */
export const VehicleClaimSchema = z.object({
    claimId: z.string().min(1),
    shopId: z.string().min(1),
    vin: z.string().length(17),
    text: z.string().min(1),
    sourceEventIds: z.array(z.string().min(1)).min(1),
    supersedesClaimId: z.string().min(1).optional(),
    status: z.enum(['active', 'superseded', 'retired']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});

export type VehicleClaim = z.infer<typeof VehicleClaimSchema>;

/** Vehicle record: owned by the shop, keyed by shop + VIN. */
export const VehicleRecordSchema = z.object({
    shopId: z.string().min(1),
    vin: z.string().length(17),
    summary: z.string(),
    claims: z.array(VehicleClaimSchema),
    updatedAt: z.string().datetime(),
});

export type VehicleRecord = z.infer<typeof VehicleRecordSchema>;

/** Shop business settings, set once by the owner on the web. Diagnostic knowledge is never stored here; it is learned only through LM-23. */
export const ShopSettingsSchema = z.object({
    shopId: z.string().min(1),
    laborRateCents: z.number().int().min(0),
    currency: z.string().length(3),
    suppliers: z.array(z.string().min(1)),
    updatedAt: z.string().datetime(),
    updatedBy: z.string().min(1),
});

export type ShopSettings = z.infer<typeof ShopSettingsSchema>;

export const CaseReferenceSchema = z.object({
    caseId: z.string().min(1),
    shopId: z.string().min(1),
    vin: z.string().length(17),
});

export type CaseReference = z.infer<typeof CaseReferenceSchema>;
