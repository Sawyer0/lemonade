import { z } from 'zod';

// --- Chat Request ---
export const ChatRequestSchema = z.object({
    sessionId: z.string().uuid(),
    message: z.string().min(1).max(500),
});

export type ChatRequestDTO = z.infer<typeof ChatRequestSchema>;

// --- Chat Response ---
export const ChatResponseSchema = z.object({
    role: z.literal('assistant'),
    content: z.string(),
});

export type ChatResponseDTO = z.infer<typeof ChatResponseSchema>;
