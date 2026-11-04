import { z } from 'zod';

export const SearchRequestSchema = z.object({
    query: z.string().min(1),
    limit: z.number().int().positive().default(3),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
});

export const SearchResultItemSchema = z.object({
    title: z.string(),
    link: z.string().url(),
    snippet: z.string(),
    source: z.string().optional(),
});

export const SearchResponseSchema = z.object({
    results: z.array(SearchResultItemSchema),
    queryUsed: z.string(),
    totalFound: z.number().int().nonnegative(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const VerificationRequestSchema = z.object({
    hypothesis: z.string().min(1),
    evidence: z.string().min(1),
    sessionId: z.string().optional(),
});

export const VerificationResponseSchema = z.object({
    isVerified: z.boolean(),
    source: z.string().nullable(),
    reasoning: z.string(),
});

export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>;
