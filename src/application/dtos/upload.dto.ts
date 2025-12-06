import { z } from 'zod';

// --- Sign Request ---
export const SignRequestSchema = z.object({
    contentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png']),
    sessionId: z.string().uuid(),
});

export type SignRequestDTO = z.infer<typeof SignRequestSchema>;

// --- Sign Response ---
export const SignResponseSchema = z.object({
    uploadUrl: z.string().url(),
    publicUrl: z.string().url(),
});

export type SignResponseDTO = z.infer<typeof SignResponseSchema>;
