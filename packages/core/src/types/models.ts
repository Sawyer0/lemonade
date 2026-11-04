import { z } from 'zod';

// --- Value Objects ---
export const SafetyRecallSchema = z.object({
    ReportReceivedDate: z.string(),
    Component: z.string(),
    Summary: z.string(),
    Consequence: z.string(),
    Remedy: z.string(),
    Notes: z.string(),
    NHTSACampaignNumber: z.string().optional(),
    Manufacturer: z.string().optional(),
    parkIt: z.boolean().optional(),
    parkOutSide: z.boolean().optional(),
    overTheAirUpdate: z.boolean().optional(),
    NHTSAActionNumber: z.string().optional(),
    ModelYear: z.string().optional(),
    Make: z.string().optional(),
    Model: z.string().optional(),
});

export type SafetyRecall = z.infer<typeof SafetyRecallSchema>;

export const AIAnalysisSchema = z.object({
    diagnosis: z.string(),
    reasoning: z.string().describe('Rationale for the diagnosis'),
    investigationPlan: z.array(z.string()).describe('Diagnostic steps to verify hypothesis'),
    visual_evidence: z.array(z.string()),
    acoustic_evidence: z.array(z.string()),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    safety_alert: z.boolean().default(false),
    suggested_actions: z.array(z.string()),

    // Neuro-Symbolic Enhancements
    engineDescription: z.string().describe('Description of the visual scene'),
    isStock: z.boolean().describe('Does the part look like stock OEM?'),
    visualConflictDetected: z.boolean().describe('Conflict between context and reality?'),
    detectedCondition: z.enum(['clean', 'rust', 'leak', 'broken', 'modified', 'unknown']),
    confidence: z.number().min(0).max(1).describe('AI confidence score 0-1'),

    // Layer 4 Verification
    verification: z
        .object({
            isVerified: z.boolean(),
            verifiedSource: z.string().nullable(),
            conflictingEvidence: z.string().nullable().optional(),
        })
        .optional(),
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

// --- Tool Result Value Objects ---

export const DisplayContentToolResultSchema = z.object({
    url: z.string().regex(/^(http|https):\/\//, 'Invalid URL'),
    type: z.string(),
    title: z.string().optional(),
});

export type DisplayContentToolResult = z.infer<typeof DisplayContentToolResultSchema>;

// --- Entities ---

export const VehicleSchema = z.object({
    id: z.string().uuid(),
    vin: z.string().length(17),
    userId: z.string(),
    specs: z.object({
        year: z.number(),
        make: z.string(),
        model: z.string(),
        engine: z.string(),
        trim: z.string().optional(),
    }),
    photoUrl: z.string().optional(),
    activeIssuesCount: z.number().default(0),
    createdAt: z.date(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
export type VehicleSpecs = Vehicle['specs'];

export const MessagePartSchema = z.object({
    type: z.enum(['text', 'image', 'audio', 'tool_result', 'tool-result', 'tool-call', 'fileData', 'image_url']),
    text: z.string().optional(),
    image: z.string().optional(),
    data: z.unknown().optional(),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    args: z.unknown().optional(),
    result: z.unknown().optional(),
    isError: z.boolean().optional(),
    // Multimodal fields
    fileData: z.object({ mimeType: z.string(), fileUri: z.string() }).optional(),
    image_url: z.object({ url: z.string() }).optional(),
});

export type MessagePart = z.infer<typeof MessagePartSchema>;

export const DiagnosticSessionSchema = z.object({
    id: z.string().uuid(),
    vehicleId: z.string(),
    userId: z.string(),
    status: z.enum(['active', 'analyzing', 'waiting_user', 'completed']),

    // The "Medical Chart"
    complaint: z.string().nullable().optional(),
    obdCodes: z.array(z.string()).default([]),

    // Multimodal Data
    videoUrl: z.string().optional(),
    aiAnalysis: AIAnalysisSchema.nullable(),

    messages: z.array(
        z.object({
            role: z.enum(['user', 'assistant', 'system', 'tool']),
            // Content can be a string or array of message parts
            content: z.union([z.string(), z.array(MessagePartSchema)]),
            timestamp: z.date(),
        }),
    ),

    // Unified Session Context
    context: z
        .object({
            activeCacheName: z.string().optional(),
            cachedFileNames: z.array(z.string()).optional(),
            lastSummary: z.string().optional(),
            vin: z.string().optional(),
        })
        .optional(),

    // Safety intervention tracking (set by SafetyMonitor or Cloud Functions)
    safety_stop: z.boolean().default(false),
    safety_reason: z.string().optional(),

    cumulativeVideoDurationProcessedMinutes: z.number().default(0),
    lastProcessedFrameTimestamp: z.number().optional(),
    cumulativeAudioDurationProcessedMinutes: z.number().default(0),
    lastProcessedAudioChunkTimestamp: z.number().optional(),

    // Phase 3: XState Persistence - enables session recovery after app crash/restart
    xstateSnapshot: z.unknown().optional(),

    updatedAt: z.date(),
    startedAt: z.date(),
});

export type DiagnosticSession = z.infer<typeof DiagnosticSessionSchema>;

// --- Billing ---
export const AIUsageRecordSchema = z.object({
    userId: z.string(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    model: z.string(),
    timestamp: z.date(),
    sessionId: z.string().uuid().optional(),
    searchQueries: z.number().int().min(0).default(0).optional(),
    traceId: z.string().optional(),
});

export type AIUsageRecord = z.infer<typeof AIUsageRecordSchema>;

// --- User ---
export const UserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string().optional(),
    photoUrl: z.string().optional(),
    tier: z.enum(['free', 'pro']).default('free'),
    subscriptionId: z.string().optional(),
    stripeCustomerId: z.string().optional(),
    preferences: z
        .object({
            autoOpenCamera: z.boolean().default(false),
        })
        .default({ autoOpenCamera: false }),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const VectorDocumentSchema = z.object({
    id: z.string(),
    text: z.string(),
    vector: z.array(z.number()),
    metadata: z.record(z.unknown()),
    createdAt: z.date(),
});

export type VectorDocument = z.infer<typeof VectorDocumentSchema>;
