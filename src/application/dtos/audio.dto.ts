import { z } from 'zod';
import { AIAnalysisSchema } from '@lemonade/core';

export const AudioChunkRequestSchema = z.object({
    audioData: z.string().startsWith('data:audio/', 'Audio data must be a base64 data URI.'),
    mimeType: z.string().startsWith('audio/', 'Mime type must be an audio type.'),
    chunkDurationSeconds: z.number().min(0.1, 'Audio chunk duration must be positive.'),
    audioTimestamp: z.number().optional(),
    vehicleContext: z.string(),
});

export type AudioChunkRequestDTO = z.infer<typeof AudioChunkRequestSchema>;

export const AudioChunkResponseSchema = z.object({
    analysis: AIAnalysisSchema.nullable(), // Null if rate-limited
    message: z.string().optional(), // e.g., "Rate limit exceeded"
});

export type AudioChunkResponseDTO = z.infer<typeof AudioChunkResponseSchema>;

