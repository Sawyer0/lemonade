import { z } from 'zod';

export const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.any(),
    })),
    sessionId: z.string().uuid(),
});

export type ChatRequestDTO = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.any(),
});

export type ChatResponseDTO = z.infer<typeof ChatResponseSchema>;

