import { z } from 'zod';

export const VoiceRequestSchema = z.object({
    sessionId: z.string().uuid(),
    audioData: z.record(z.string(), z.number()),
});

export type VoiceRequestDTO = z.infer<typeof VoiceRequestSchema>;

export const VoiceResponseSchema = z.object({
    response: z.string(),
});

export type VoiceResponseDTO = z.infer<typeof VoiceResponseSchema>;

