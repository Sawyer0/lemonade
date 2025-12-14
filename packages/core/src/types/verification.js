"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationResponseSchema = exports.VerificationRequestSchema = exports.SearchResponseSchema = exports.SearchResultItemSchema = exports.SearchRequestSchema = void 0;
const zod_1 = require("zod");
exports.SearchRequestSchema = zod_1.z.object({
    query: zod_1.z.string().min(1),
    limit: zod_1.z.number().int().positive().default(3),
    userId: zod_1.z.string().optional(),
    sessionId: zod_1.z.string().optional()
});
exports.SearchResultItemSchema = zod_1.z.object({
    title: zod_1.z.string(),
    link: zod_1.z.string().url(),
    snippet: zod_1.z.string(),
    source: zod_1.z.string().optional()
});
exports.SearchResponseSchema = zod_1.z.object({
    results: zod_1.z.array(exports.SearchResultItemSchema),
    queryUsed: zod_1.z.string(),
    totalFound: zod_1.z.number().int().nonnegative()
});
exports.VerificationRequestSchema = zod_1.z.object({
    hypothesis: zod_1.z.string().min(1),
    evidence: zod_1.z.string().min(1),
    sessionId: zod_1.z.string().optional()
});
exports.VerificationResponseSchema = zod_1.z.object({
    isVerified: zod_1.z.boolean(),
    source: zod_1.z.string().nullable(),
    reasoning: zod_1.z.string()
});
