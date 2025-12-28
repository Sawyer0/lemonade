export type ReasoningEffort = "none" | "low" | "moderate" | "high";

export interface AiGenerationConfig {
    thinkingConfig?: {
        thinkingBudget?: number;
        includeThoughts?: boolean;
    };
    temperature: number;
    responseMimeType?: "text/plain" | "application/json";
}

export interface VerificationResult {
    isVerified: boolean;
    source: string | null;
    reasoning: string;
}

/**
 * Request for embedding content.
 */
export interface EmbedContentRequest {
    content: { role: string; parts: { text: string }[] };
    taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
    title?: string;
}

/**
 * Response for embedding content.
 */
export interface EmbedContentResponse {
    embedding: {
        values: number[];
    };
}

/**
 * Response for batch embedding content.
 */
export interface BatchEmbedContentsResponse {
    embeddings: { values: number[] }[];
}

// Default configs as per the user's table

export const AI_GENERATION_CONFIGS = {
    LIVE_VIDEO: {
        thinkingConfig: {
            thinkingBudget: 16384, // Max reasoning for video analysis
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "application/json" as const,
    },
    MANUAL_READER: {
        thinkingConfig: {
            thinkingBudget: 8192, // High reasoning for reading manuals
            includeThoughts: false
        },
        temperature: 0.0,
        responseMimeType: "text/plain" as const,
    },
    MANUAL_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "text/plain" as const,
    },
    CHAT_BOT: {
        // No thinkingConfig -> Dynamic (Zero latency for simple, deep for complex)
        temperature: 0.4,
        responseMimeType: "text/plain" as const,
    },
    CHAT_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.3,
        responseMimeType: "text/plain" as const,
    },
    CHAT_HIGH: {
        thinkingConfig: {
            thinkingBudget: 16384, // Force deep reasoning for Master Tech diagnosis
            includeThoughts: false
        },
        temperature: 0.2, // Low temp + high budget = focused deep thought
        responseMimeType: "text/plain" as const,
    },
    VOICE_COMMAND: {
        temperature: 0.1,
        responseMimeType: "text/plain" as const,
    }
};

import { z } from 'zod';

/**
 * Unified event types for the agentic streaming protocol (NDJSON).
 */
export const StreamingEventSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('text'),
        content: z.string(),
    }),
    z.object({
        type: z.literal('thought'),
        content: z.string(),
    }),
    z.object({
        type: z.literal('tool_call'),
        toolName: z.string(),
        toolCallId: z.string(),
        args: z.unknown(),
    }),
    z.object({
        type: z.literal('tool_result'),
        toolName: z.string(),
        toolCallId: z.string(),
        result: z.unknown(),
    }),
    z.object({
        type: z.literal('error'),
        message: z.string(),
        code: z.string().optional(),
    }),
    z.object({
        type: z.literal('done'),
    }),
]);

export type StreamingEvent = z.infer<typeof StreamingEventSchema>;
