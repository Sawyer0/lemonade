import { z } from 'zod';

// --- Voice Request ---
export const VoiceRequestSchema = z.object({
    sessionId: z.string().uuid(),
    audioData: z.record(z.string(), z.number()), // Float32Array serialized as { "0": 0.1, "1": 0.2, ... }
});

export type VoiceRequestDTO = z.infer<typeof VoiceRequestSchema>;

// --- Voice Response ---
export const VoiceResponseSchema = z.object({
    response: z.string(),
});

export type VoiceResponseDTO = z.infer<typeof VoiceResponseSchema>;
