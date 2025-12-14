import { z } from 'zod';
import { DiagnosticSessionSchema } from '@lemonade/core';

export const StartSessionRequestSchema = z.object({
    vehicleId: z.string().uuid(),
    complaint: z.string().optional(),
});

export type StartSessionRequestDTO = z.infer<typeof StartSessionRequestSchema>;

export const StartSessionResponseSchema = z.object({
    sessionId: z.string().uuid(),
});

export type StartSessionResponseDTO = z.infer<typeof StartSessionResponseSchema>;

export const SessionListResponseSchema = z.object({
    data: z.array(DiagnosticSessionSchema),
});

export type SessionListResponseDTO = z.infer<typeof SessionListResponseSchema>;

export const SessionDetailsResponseSchema = z.object({
    data: DiagnosticSessionSchema,
});

export type SessionDetailsResponseDTO = z.infer<typeof SessionDetailsResponseSchema>;