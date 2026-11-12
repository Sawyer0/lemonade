import { z } from 'zod';
import { CaseReportSchema, CaseSchema, LedgerEntrySchema, OutcomePayloadSchema } from '@lemonade/core';

export const CloseCaseRequestSchema = z.object({
    outcome: OutcomePayloadSchema,
});
export type CloseCaseRequestDTO = z.infer<typeof CloseCaseRequestSchema>;

export const CloseCaseResponseSchema = z.object({
    data: z.object({
        case: CaseSchema,
        outcomeEntry: LedgerEntrySchema,
    }),
});
export type CloseCaseResponseDTO = z.infer<typeof CloseCaseResponseSchema>;

export const CaseDetailsResponseSchema = z.object({
    data: z.object({
        case: CaseSchema,
        entries: z.array(LedgerEntrySchema),
    }),
});
export type CaseDetailsResponseDTO = z.infer<typeof CaseDetailsResponseSchema>;

// LM-06: the one-page report built from the ledger, served as JSON. The
// report page renders this; the browser's print dialog saves it as PDF.
export const CaseReportResponseSchema = z.object({
    data: CaseReportSchema,
});
export type CaseReportResponseDTO = z.infer<typeof CaseReportResponseSchema>;
