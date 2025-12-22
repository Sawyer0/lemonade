import { z } from 'zod';

export const AnalysisTriggerRequestSchema = z.object({
    sessionId: z.string().uuid(),
    publicUrl: z.string().url(),
});

export type AnalysisTriggerRequestDTO = z.infer<typeof AnalysisTriggerRequestSchema>;

export const AnalysisTriggerResponseSchema = z.object({
    status: z.literal('processing_started'),
    message: z.string(),
});

export type AnalysisTriggerResponseDTO = z.infer<typeof AnalysisTriggerResponseSchema>;

