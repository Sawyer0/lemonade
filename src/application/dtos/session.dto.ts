import { z } from 'zod';

// --- Start Session Request ---
export const StartSessionRequestSchema = z.object({
    vehicleId: z.string().uuid(),
});

export type StartSessionRequestDTO = z.infer<typeof StartSessionRequestSchema>;

// --- Start Session Response ---
export const StartSessionResponseSchema = z.object({
    sessionId: z.string().uuid(),
});

export type StartSessionResponseDTO = z.infer<typeof StartSessionResponseSchema>;
