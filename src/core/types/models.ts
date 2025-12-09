import { z } from 'zod';

// --- Value Objects ---

export const AIAnalysisSchema = z.object({
    diagnosis: z.string(),
    visual_evidence: z.array(z.string()), // "Smoke from valve cover"
    acoustic_evidence: z.array(z.string()), // "Rhythmic clicking at 4Hz"
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    safety_alert: z.boolean().default(false),
    suggested_actions: z.array(z.string()),
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

// --- Entities ---

export const VehicleSchema = z.object({
    id: z.string().uuid(),
    vin: z.string().length(17),
    userId: z.string(),
    // "Fixed Identity" (DNA)
    specs: z.object({
        year: z.number(),
        make: z.string(),
        model: z.string(),
        engine: z.string(),
        trim: z.string().optional(),
    }),
    photoUrl: z.string().url().optional(),
    activeIssuesCount: z.number().default(0),
    createdAt: z.date(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;

export const MessagePartSchema = z.object({
    type: z.enum(['text', 'image', 'audio', 'tool_result', 'tool-result', 'tool-call']),
    text: z.string().optional(),
    image: z.string().optional(),
    data: z.unknown().optional(),
    // Tool fields
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    args: z.unknown().optional(),
    result: z.unknown().optional(),
    isError: z.boolean().optional(),
});

export type MessagePart = z.infer<typeof MessagePartSchema>;

export const DiagnosticSessionSchema = z.object({
    id: z.string().uuid(),
    vehicleId: z.string(),
    userId: z.string(),
    status: z.enum(['active', 'analyzing', 'waiting_user', 'completed']),

    // The "Medical Chart"
    complaint: z.string(),
    obdCodes: z.array(z.string()).default([]),

    // Multimodal Data
    videoUrl: z.string().url().optional(), // The raw file
    aiAnalysis: AIAnalysisSchema.nullable(), // The "Translation"

    messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        // Content can be a string or array of message parts
        content: z.union([
            z.string(),
            z.array(MessagePartSchema)
        ]),
        timestamp: z.date()
    })),

    // Unified Session Context
    context: z.object({
        activeCacheName: z.string().optional(), // The shared Gemini Cache ID
        cachedFileNames: z.array(z.string()).optional(),
        lastSummary: z.string().optional(),
        vin: z.string().optional()
    }).optional(),

    // Safety intervention tracking (set by SafetyMonitor or Cloud Functions)
    safety_stop: z.boolean().default(false),
    safety_reason: z.string().optional(),

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
    sessionId: z.string().uuid().optional(), // Link to session if applicable
});

export type AIUsageRecord = z.infer<typeof AIUsageRecordSchema>;

// --- User ---
export const UserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string().optional(),
    photoUrl: z.string().url().optional(),
    preferences: z.object({
        autoOpenCamera: z.boolean().default(false),
    }).default({ autoOpenCamera: false }),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;