import { z } from 'zod';
import { CaseStatusSchema } from '../types/case';

// --- Case report model (LM-06) ---
// A one-page report built straight from a case's evidence ledger. Every
// statement carries the citation of the ledger entry it came from, so a shop
// owner or fleet manager can trace any line back to the entry that proves
// it. The report is plain JSON: all timestamps are ISO strings, so it
// round-trips through the API unchanged. A section is absent when the ledger
// has no entry for it — the report never states what the ledger does not
// prove.

/** The ledger entry a statement came from. `sequence` is the entry's place in the chain. */
export const ReportCitationSchema = z.object({
    entryId: z.string().uuid(),
    sequence: z.number().int().min(1),
    occurredAt: z.string().datetime(),
});
export type ReportCitation = z.infer<typeof ReportCitationSchema>;

/** Vehicle identity, from the latest `vin_decoded` entry. */
export const ReportVehicleSchema = z.object({
    vin: z.string().length(17),
    year: z.number().int().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    trim: z.string().optional(),
    citation: ReportCitationSchema,
});
export type ReportVehicle = z.infer<typeof ReportVehicleSchema>;

/** The complaint: the goal's tech-confirmed complaint when the case has a
 * goal, otherwise the earliest observation. */
export const ReportComplaintSchema = z.object({
    text: z.string().min(1),
    citation: ReportCitationSchema,
});
export type ReportComplaint = z.infer<typeof ReportComplaintSchema>;

/** One diagnostic trouble code, with the state the scan read it in. */
export const ReportCodeSchema = z.object({
    code: z.string().min(1),
    state: z.enum(['read', 'stored', 'pending', 'permanent']),
    freezeFrame: z.record(z.unknown()).optional(),
    citation: ReportCitationSchema,
});
export type ReportCode = z.infer<typeof ReportCodeSchema>;

/** One evidence item: a tech observation or a captured frame. Frames carry
 * the storage reference and hash, never the bytes. */
export const ReportEvidenceItemSchema = z.object({
    kind: z.enum(['observation', 'frame']),
    text: z.string().optional(),
    mediaUri: z.string().optional(),
    mediaSha256: z.string().optional(),
    occurredAt: z.string().datetime(),
    citation: ReportCitationSchema,
});
export type ReportEvidenceItem = z.infer<typeof ReportEvidenceItemSchema>;

/** One hypothesis in the differential, at its latest stated confidence. */
export const ReportDifferentialItemSchema = z.object({
    hypothesis: z.string().min(1),
    confidence: z.number().min(0).max(1),
    citation: ReportCitationSchema,
});
export type ReportDifferentialItem = z.infer<typeof ReportDifferentialItemSchema>;

/** One test run: a manual test result, a guided OBD test, or a verify-fix verdict. */
export const ReportTestItemSchema = z.object({
    name: z.string().min(1),
    result: z.enum(['pass', 'fail', 'inconclusive']),
    measuredValue: z.number().optional(),
    unit: z.string().optional(),
    citation: ReportCitationSchema,
});
export type ReportTestItem = z.infer<typeof ReportTestItemSchema>;

/** The repair, from the case's `outcome` entry. */
export const ReportRepairSchema = z.object({
    repairPerformed: z.string().min(1),
    partsReplaced: z.array(z.string().min(1)),
    citation: ReportCitationSchema,
});
export type ReportRepair = z.infer<typeof ReportRepairSchema>;

/** The outcome, from the same `outcome` entry as the repair. */
export const ReportOutcomeSchema = z.object({
    codesCleared: z.boolean(),
    symptomGone: z.boolean(),
    retestPassed: z.boolean(),
    confirmed: z.boolean(),
    notes: z.string().optional(),
    citation: ReportCitationSchema,
});
export type ReportOutcome = z.infer<typeof ReportOutcomeSchema>;

/** A correction: the retracting text and the entry it retracts. The
 * corrected entry itself appears nowhere else in the report. */
export const ReportCorrectionSchema = z.object({
    text: z.string().min(1),
    correctedEntryId: z.string().uuid(),
    citation: ReportCitationSchema,
});
export type ReportCorrection = z.infer<typeof ReportCorrectionSchema>;

export const CaseReportSchema = z.object({
    caseId: z.string().uuid(),
    caseStatus: CaseStatusSchema,
    generatedAt: z.string().datetime(),
    entryCount: z.number().int().min(0),
    vehicle: ReportVehicleSchema.optional(),
    complaint: ReportComplaintSchema.optional(),
    codes: z.array(ReportCodeSchema),
    evidence: z.array(ReportEvidenceItemSchema),
    differential: z.array(ReportDifferentialItemSchema),
    tests: z.array(ReportTestItemSchema),
    repair: ReportRepairSchema.optional(),
    outcome: ReportOutcomeSchema.optional(),
    corrections: z.array(ReportCorrectionSchema),
});
export type CaseReport = z.infer<typeof CaseReportSchema>;
