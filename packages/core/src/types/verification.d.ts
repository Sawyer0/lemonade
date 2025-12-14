import { z } from 'zod';
export declare const SearchRequestSchema: z.ZodObject<{
    query: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    query: string;
    limit: number;
    userId?: string | undefined;
    sessionId?: string | undefined;
}, {
    query: string;
    userId?: string | undefined;
    sessionId?: string | undefined;
    limit?: number | undefined;
}>;
export declare const SearchResultItemSchema: z.ZodObject<{
    title: z.ZodString;
    link: z.ZodString;
    snippet: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    link: string;
    snippet: string;
    source?: string | undefined;
}, {
    title: string;
    link: string;
    snippet: string;
    source?: string | undefined;
}>;
export declare const SearchResponseSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        link: z.ZodString;
        snippet: z.ZodString;
        source: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        link: string;
        snippet: string;
        source?: string | undefined;
    }, {
        title: string;
        link: string;
        snippet: string;
        source?: string | undefined;
    }>, "many">;
    queryUsed: z.ZodString;
    totalFound: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    results: {
        title: string;
        link: string;
        snippet: string;
        source?: string | undefined;
    }[];
    queryUsed: string;
    totalFound: number;
}, {
    results: {
        title: string;
        link: string;
        snippet: string;
        source?: string | undefined;
    }[];
    queryUsed: string;
    totalFound: number;
}>;
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export declare const VerificationRequestSchema: z.ZodObject<{
    hypothesis: z.ZodString;
    evidence: z.ZodString;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    hypothesis: string;
    evidence: string;
    sessionId?: string | undefined;
}, {
    hypothesis: string;
    evidence: string;
    sessionId?: string | undefined;
}>;
export declare const VerificationResponseSchema: z.ZodObject<{
    isVerified: z.ZodBoolean;
    source: z.ZodNullable<z.ZodString>;
    reasoning: z.ZodString;
}, "strip", z.ZodTypeAny, {
    isVerified: boolean;
    source: string | null;
    reasoning: string;
}, {
    isVerified: boolean;
    source: string | null;
    reasoning: string;
}>;
export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;
export type VerificationResponse = z.infer<typeof VerificationResponseSchema>;
