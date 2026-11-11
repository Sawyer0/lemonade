import { z } from 'zod';
import { CaseSchema, LedgerEntrySchema, OutcomePayloadSchema } from '@lemonade/core';

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
