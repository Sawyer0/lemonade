import { z } from 'zod';
import { MessagePartSchema } from '@lemonade/core';

/** A message body: plain text or the multimodal parts the chat stores. */
const MessageContentSchema = z.union([z.string(), z.array(MessagePartSchema)]);

export const ChatRequestSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['user', 'assistant', 'system', 'tool']),
            content: MessageContentSchema,
        }),
    ),
    sessionId: z.string().uuid(),
});

export type ChatRequestDTO = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.unknown(),
});

export type ChatResponseDTO = z.infer<typeof ChatResponseSchema>;
