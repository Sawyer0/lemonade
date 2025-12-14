"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorDocumentSchema = exports.UserSchema = exports.AIUsageRecordSchema = exports.DiagnosticSessionSchema = exports.MessagePartSchema = exports.VehicleSchema = exports.DisplayContentToolResultSchema = exports.AIAnalysisSchema = exports.SafetyRecallSchema = void 0;
const zod_1 = require("zod");
// --- Value Objects ---
exports.SafetyRecallSchema = zod_1.z.object({
    ReportReceivedDate: zod_1.z.string(),
    Component: zod_1.z.string(),
    Summary: zod_1.z.string(),
    Consequence: zod_1.z.string(),
    Remedy: zod_1.z.string(),
    Notes: zod_1.z.string(),
    NHTSACampaignNumber: zod_1.z.string().optional(),
    Manufacturer: zod_1.z.string().optional(),
    parkIt: zod_1.z.boolean().optional(),
    parkOutSide: zod_1.z.boolean().optional(),
    overTheAirUpdate: zod_1.z.boolean().optional(),
    NHTSAActionNumber: zod_1.z.string().optional(),
    ModelYear: zod_1.z.string().optional(),
    Make: zod_1.z.string().optional(),
    Model: zod_1.z.string().optional(),
});
exports.AIAnalysisSchema = zod_1.z.object({
    diagnosis: zod_1.z.string(),
    visual_evidence: zod_1.z.array(zod_1.z.string()),
    acoustic_evidence: zod_1.z.array(zod_1.z.string()),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
    safety_alert: zod_1.z.boolean().default(false),
    suggested_actions: zod_1.z.array(zod_1.z.string()),
    // Neuro-Symbolic Enhancements
    engineDescription: zod_1.z.string().describe("Description of the visual scene"),
    isStock: zod_1.z.boolean().describe("Does the part look like stock OEM?"),
    visualConflictDetected: zod_1.z.boolean().describe("Conflict between context and reality?"),
    detectedCondition: zod_1.z.enum(['clean', 'rust', 'leak', 'broken', 'modified', 'unknown']),
    confidence: zod_1.z.number().min(0).max(1).describe("AI confidence score 0-1"),
    // Layer 4 Verification
    verification: zod_1.z.object({
        isVerified: zod_1.z.boolean(),
        verifiedSource: zod_1.z.string().nullable(),
        conflictingEvidence: zod_1.z.string().nullable().optional()
    }).optional()
});
// --- Tool Result Value Objects ---
exports.DisplayContentToolResultSchema = zod_1.z.object({
    url: zod_1.z.string().regex(/^(http|https):\/\//, "Invalid URL"),
    type: zod_1.z.string(),
    title: zod_1.z.string().optional()
});
// --- Entities ---
exports.VehicleSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    vin: zod_1.z.string().length(17),
    userId: zod_1.z.string(),
    specs: zod_1.z.object({
        year: zod_1.z.number(),
        make: zod_1.z.string(),
        model: zod_1.z.string(),
        engine: zod_1.z.string(),
        trim: zod_1.z.string().optional(),
    }),
    photoUrl: zod_1.z.string().optional(),
    activeIssuesCount: zod_1.z.number().default(0),
    createdAt: zod_1.z.date(),
});
exports.MessagePartSchema = zod_1.z.object({
    type: zod_1.z.enum(['text', 'image', 'audio', 'tool_result', 'tool-result', 'tool-call']),
    text: zod_1.z.string().optional(),
    image: zod_1.z.string().optional(),
    data: zod_1.z.unknown().optional(),
    toolCallId: zod_1.z.string().optional(),
    toolName: zod_1.z.string().optional(),
    args: zod_1.z.unknown().optional(),
    result: zod_1.z.unknown().optional(),
    isError: zod_1.z.boolean().optional(),
});
exports.DiagnosticSessionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    vehicleId: zod_1.z.string(),
    userId: zod_1.z.string(),
    status: zod_1.z.enum(['active', 'analyzing', 'waiting_user', 'completed']),
    // The "Medical Chart"
    complaint: zod_1.z.string().optional(),
    obdCodes: zod_1.z.array(zod_1.z.string()).default([]),
    // Multimodal Data
    videoUrl: zod_1.z.string().optional(),
    aiAnalysis: exports.AIAnalysisSchema.nullable(),
    messages: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['user', 'assistant', 'system', 'tool']),
        // Content can be a string or array of message parts
        content: zod_1.z.union([
            zod_1.z.string(),
            zod_1.z.array(exports.MessagePartSchema)
        ]),
        timestamp: zod_1.z.date()
    })),
    // Unified Session Context
    context: zod_1.z.object({
        activeCacheName: zod_1.z.string().optional(),
        cachedFileNames: zod_1.z.array(zod_1.z.string()).optional(),
        lastSummary: zod_1.z.string().optional(),
        vin: zod_1.z.string().optional()
    }).optional(),
    // Safety intervention tracking (set by SafetyMonitor or Cloud Functions)
    safety_stop: zod_1.z.boolean().default(false),
    safety_reason: zod_1.z.string().optional(),
    cumulativeVideoDurationProcessedMinutes: zod_1.z.number().default(0),
    lastProcessedFrameTimestamp: zod_1.z.number().optional(),
    cumulativeAudioDurationProcessedMinutes: zod_1.z.number().default(0),
    lastProcessedAudioChunkTimestamp: zod_1.z.number().optional(),
    updatedAt: zod_1.z.date(),
    startedAt: zod_1.z.date(),
});
// --- Billing ---
exports.AIUsageRecordSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    inputTokens: zod_1.z.number().int().min(0),
    outputTokens: zod_1.z.number().int().min(0),
    model: zod_1.z.string(),
    timestamp: zod_1.z.date(),
    sessionId: zod_1.z.string().uuid().optional(),
    searchQueries: zod_1.z.number().int().min(0).default(0).optional(),
    traceId: zod_1.z.string().optional(),
});
// --- User ---
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string().optional(),
    photoUrl: zod_1.z.string().optional(),
    tier: zod_1.z.enum(['free', 'pro']).default('free'),
    subscriptionId: zod_1.z.string().optional(),
    stripeCustomerId: zod_1.z.string().optional(),
    preferences: zod_1.z.object({
        autoOpenCamera: zod_1.z.boolean().default(false),
    }).default({ autoOpenCamera: false }),
    createdAt: zod_1.z.date(),
    updatedAt: zod_1.z.date(),
});
exports.VectorDocumentSchema = zod_1.z.object({
    id: zod_1.z.string(),
    text: zod_1.z.string(),
    vector: zod_1.z.array(zod_1.z.number()),
    metadata: zod_1.z.record(zod_1.z.any()), // Assuming metadata can be any key-value pair
    createdAt: zod_1.z.date(),
});
