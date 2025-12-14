import { z } from 'zod';
export declare const SafetyRecallSchema: z.ZodObject<{
    ReportReceivedDate: z.ZodString;
    Component: z.ZodString;
    Summary: z.ZodString;
    Consequence: z.ZodString;
    Remedy: z.ZodString;
    Notes: z.ZodString;
    NHTSACampaignNumber: z.ZodOptional<z.ZodString>;
    Manufacturer: z.ZodOptional<z.ZodString>;
    parkIt: z.ZodOptional<z.ZodBoolean>;
    parkOutSide: z.ZodOptional<z.ZodBoolean>;
    overTheAirUpdate: z.ZodOptional<z.ZodBoolean>;
    NHTSAActionNumber: z.ZodOptional<z.ZodString>;
    ModelYear: z.ZodOptional<z.ZodString>;
    Make: z.ZodOptional<z.ZodString>;
    Model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Consequence: string;
    Remedy: string;
    Notes: string;
    NHTSACampaignNumber?: string | undefined;
    Manufacturer?: string | undefined;
    parkIt?: boolean | undefined;
    parkOutSide?: boolean | undefined;
    overTheAirUpdate?: boolean | undefined;
    NHTSAActionNumber?: string | undefined;
    ModelYear?: string | undefined;
    Make?: string | undefined;
    Model?: string | undefined;
}, {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Consequence: string;
    Remedy: string;
    Notes: string;
    NHTSACampaignNumber?: string | undefined;
    Manufacturer?: string | undefined;
    parkIt?: boolean | undefined;
    parkOutSide?: boolean | undefined;
    overTheAirUpdate?: boolean | undefined;
    NHTSAActionNumber?: string | undefined;
    ModelYear?: string | undefined;
    Make?: string | undefined;
    Model?: string | undefined;
}>;
export type SafetyRecall = z.infer<typeof SafetyRecallSchema>;
export declare const AIAnalysisSchema: z.ZodObject<{
    diagnosis: z.ZodString;
    visual_evidence: z.ZodArray<z.ZodString, "many">;
    acoustic_evidence: z.ZodArray<z.ZodString, "many">;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    safety_alert: z.ZodDefault<z.ZodBoolean>;
    suggested_actions: z.ZodArray<z.ZodString, "many">;
    engineDescription: z.ZodString;
    isStock: z.ZodBoolean;
    visualConflictDetected: z.ZodBoolean;
    detectedCondition: z.ZodEnum<["clean", "rust", "leak", "broken", "modified", "unknown"]>;
    confidence: z.ZodNumber;
    verification: z.ZodOptional<z.ZodObject<{
        isVerified: z.ZodBoolean;
        verifiedSource: z.ZodNullable<z.ZodString>;
        conflictingEvidence: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence?: string | null | undefined;
    }, {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence?: string | null | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    diagnosis: string;
    visual_evidence: string[];
    acoustic_evidence: string[];
    severity: "low" | "medium" | "high" | "critical";
    safety_alert: boolean;
    suggested_actions: string[];
    engineDescription: string;
    isStock: boolean;
    visualConflictDetected: boolean;
    detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    confidence: number;
    verification?: {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence?: string | null | undefined;
    } | undefined;
}, {
    diagnosis: string;
    visual_evidence: string[];
    acoustic_evidence: string[];
    severity: "low" | "medium" | "high" | "critical";
    suggested_actions: string[];
    engineDescription: string;
    isStock: boolean;
    visualConflictDetected: boolean;
    detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
    confidence: number;
    safety_alert?: boolean | undefined;
    verification?: {
        isVerified: boolean;
        verifiedSource: string | null;
        conflictingEvidence?: string | null | undefined;
    } | undefined;
}>;
export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;
export declare const DisplayContentToolResultSchema: z.ZodObject<{
    url: z.ZodString;
    type: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: string;
    url: string;
    title?: string | undefined;
}, {
    type: string;
    url: string;
    title?: string | undefined;
}>;
export type DisplayContentToolResult = z.infer<typeof DisplayContentToolResultSchema>;
export declare const VehicleSchema: z.ZodObject<{
    id: z.ZodString;
    vin: z.ZodString;
    userId: z.ZodString;
    specs: z.ZodObject<{
        year: z.ZodNumber;
        make: z.ZodString;
        model: z.ZodString;
        engine: z.ZodString;
        trim: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        year: number;
        make: string;
        model: string;
        engine: string;
        trim?: string | undefined;
    }, {
        year: number;
        make: string;
        model: string;
        engine: string;
        trim?: string | undefined;
    }>;
    photoUrl: z.ZodOptional<z.ZodString>;
    activeIssuesCount: z.ZodDefault<z.ZodNumber>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    vin: string;
    userId: string;
    specs: {
        year: number;
        make: string;
        model: string;
        engine: string;
        trim?: string | undefined;
    };
    activeIssuesCount: number;
    createdAt: Date;
    photoUrl?: string | undefined;
}, {
    id: string;
    vin: string;
    userId: string;
    specs: {
        year: number;
        make: string;
        model: string;
        engine: string;
        trim?: string | undefined;
    };
    createdAt: Date;
    photoUrl?: string | undefined;
    activeIssuesCount?: number | undefined;
}>;
export type Vehicle = z.infer<typeof VehicleSchema>;
export type VehicleSpecs = Vehicle['specs'];
export declare const MessagePartSchema: z.ZodObject<{
    type: z.ZodEnum<["text", "image", "audio", "tool_result", "tool-result", "tool-call"]>;
    text: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodString>;
    data: z.ZodOptional<z.ZodUnknown>;
    toolCallId: z.ZodOptional<z.ZodString>;
    toolName: z.ZodOptional<z.ZodString>;
    args: z.ZodOptional<z.ZodUnknown>;
    result: z.ZodOptional<z.ZodUnknown>;
    isError: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
    text?: string | undefined;
    image?: string | undefined;
    data?: unknown;
    toolCallId?: string | undefined;
    toolName?: string | undefined;
    args?: unknown;
    result?: unknown;
    isError?: boolean | undefined;
}, {
    type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
    text?: string | undefined;
    image?: string | undefined;
    data?: unknown;
    toolCallId?: string | undefined;
    toolName?: string | undefined;
    args?: unknown;
    result?: unknown;
    isError?: boolean | undefined;
}>;
export type MessagePart = z.infer<typeof MessagePartSchema>;
export declare const DiagnosticSessionSchema: z.ZodObject<{
    id: z.ZodString;
    vehicleId: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<["active", "analyzing", "waiting_user", "completed"]>;
    complaint: z.ZodOptional<z.ZodString>;
    obdCodes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    videoUrl: z.ZodOptional<z.ZodString>;
    aiAnalysis: z.ZodNullable<z.ZodObject<{
        diagnosis: z.ZodString;
        visual_evidence: z.ZodArray<z.ZodString, "many">;
        acoustic_evidence: z.ZodArray<z.ZodString, "many">;
        severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
        safety_alert: z.ZodDefault<z.ZodBoolean>;
        suggested_actions: z.ZodArray<z.ZodString, "many">;
        engineDescription: z.ZodString;
        isStock: z.ZodBoolean;
        visualConflictDetected: z.ZodBoolean;
        detectedCondition: z.ZodEnum<["clean", "rust", "leak", "broken", "modified", "unknown"]>;
        confidence: z.ZodNumber;
        verification: z.ZodOptional<z.ZodObject<{
            isVerified: z.ZodBoolean;
            verifiedSource: z.ZodNullable<z.ZodString>;
            conflictingEvidence: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        }, {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        safety_alert: boolean;
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    }, {
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        safety_alert?: boolean | undefined;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    }>>;
    messages: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant", "system", "tool"]>;
        content: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["text", "image", "audio", "tool_result", "tool-result", "tool-call"]>;
            text: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
            data: z.ZodOptional<z.ZodUnknown>;
            toolCallId: z.ZodOptional<z.ZodString>;
            toolName: z.ZodOptional<z.ZodString>;
            args: z.ZodOptional<z.ZodUnknown>;
            result: z.ZodOptional<z.ZodUnknown>;
            isError: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }, {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }>, "many">]>;
        timestamp: z.ZodDate;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "assistant" | "system" | "tool";
        content: string | {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }[];
        timestamp: Date;
    }, {
        role: "user" | "assistant" | "system" | "tool";
        content: string | {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }[];
        timestamp: Date;
    }>, "many">;
    context: z.ZodOptional<z.ZodObject<{
        activeCacheName: z.ZodOptional<z.ZodString>;
        cachedFileNames: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        lastSummary: z.ZodOptional<z.ZodString>;
        vin: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        vin?: string | undefined;
        activeCacheName?: string | undefined;
        cachedFileNames?: string[] | undefined;
        lastSummary?: string | undefined;
    }, {
        vin?: string | undefined;
        activeCacheName?: string | undefined;
        cachedFileNames?: string[] | undefined;
        lastSummary?: string | undefined;
    }>>;
    safety_stop: z.ZodDefault<z.ZodBoolean>;
    safety_reason: z.ZodOptional<z.ZodString>;
    cumulativeVideoDurationProcessedMinutes: z.ZodDefault<z.ZodNumber>;
    lastProcessedFrameTimestamp: z.ZodOptional<z.ZodNumber>;
    cumulativeAudioDurationProcessedMinutes: z.ZodDefault<z.ZodNumber>;
    lastProcessedAudioChunkTimestamp: z.ZodOptional<z.ZodNumber>;
    updatedAt: z.ZodDate;
    startedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "active" | "analyzing" | "waiting_user" | "completed";
    id: string;
    userId: string;
    vehicleId: string;
    obdCodes: string[];
    aiAnalysis: {
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        safety_alert: boolean;
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    } | null;
    messages: {
        role: "user" | "assistant" | "system" | "tool";
        content: string | {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }[];
        timestamp: Date;
    }[];
    safety_stop: boolean;
    cumulativeVideoDurationProcessedMinutes: number;
    cumulativeAudioDurationProcessedMinutes: number;
    updatedAt: Date;
    startedAt: Date;
    complaint?: string | undefined;
    videoUrl?: string | undefined;
    context?: {
        vin?: string | undefined;
        activeCacheName?: string | undefined;
        cachedFileNames?: string[] | undefined;
        lastSummary?: string | undefined;
    } | undefined;
    safety_reason?: string | undefined;
    lastProcessedFrameTimestamp?: number | undefined;
    lastProcessedAudioChunkTimestamp?: number | undefined;
}, {
    status: "active" | "analyzing" | "waiting_user" | "completed";
    id: string;
    userId: string;
    vehicleId: string;
    aiAnalysis: {
        diagnosis: string;
        visual_evidence: string[];
        acoustic_evidence: string[];
        severity: "low" | "medium" | "high" | "critical";
        suggested_actions: string[];
        engineDescription: string;
        isStock: boolean;
        visualConflictDetected: boolean;
        detectedCondition: "unknown" | "clean" | "rust" | "leak" | "broken" | "modified";
        confidence: number;
        safety_alert?: boolean | undefined;
        verification?: {
            isVerified: boolean;
            verifiedSource: string | null;
            conflictingEvidence?: string | null | undefined;
        } | undefined;
    } | null;
    messages: {
        role: "user" | "assistant" | "system" | "tool";
        content: string | {
            type: "text" | "image" | "audio" | "tool_result" | "tool-result" | "tool-call";
            text?: string | undefined;
            image?: string | undefined;
            data?: unknown;
            toolCallId?: string | undefined;
            toolName?: string | undefined;
            args?: unknown;
            result?: unknown;
            isError?: boolean | undefined;
        }[];
        timestamp: Date;
    }[];
    updatedAt: Date;
    startedAt: Date;
    complaint?: string | undefined;
    obdCodes?: string[] | undefined;
    videoUrl?: string | undefined;
    context?: {
        vin?: string | undefined;
        activeCacheName?: string | undefined;
        cachedFileNames?: string[] | undefined;
        lastSummary?: string | undefined;
    } | undefined;
    safety_stop?: boolean | undefined;
    safety_reason?: string | undefined;
    cumulativeVideoDurationProcessedMinutes?: number | undefined;
    lastProcessedFrameTimestamp?: number | undefined;
    cumulativeAudioDurationProcessedMinutes?: number | undefined;
    lastProcessedAudioChunkTimestamp?: number | undefined;
}>;
export type DiagnosticSession = z.infer<typeof DiagnosticSessionSchema>;
export declare const AIUsageRecordSchema: z.ZodObject<{
    userId: z.ZodString;
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    model: z.ZodString;
    timestamp: z.ZodDate;
    sessionId: z.ZodOptional<z.ZodString>;
    searchQueries: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    traceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    model: string;
    timestamp: Date;
    inputTokens: number;
    outputTokens: number;
    sessionId?: string | undefined;
    searchQueries?: number | undefined;
    traceId?: string | undefined;
}, {
    userId: string;
    model: string;
    timestamp: Date;
    inputTokens: number;
    outputTokens: number;
    sessionId?: string | undefined;
    searchQueries?: number | undefined;
    traceId?: string | undefined;
}>;
export type AIUsageRecord = z.infer<typeof AIUsageRecordSchema>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodOptional<z.ZodString>;
    photoUrl: z.ZodOptional<z.ZodString>;
    tier: z.ZodDefault<z.ZodEnum<["free", "pro"]>>;
    subscriptionId: z.ZodOptional<z.ZodString>;
    stripeCustomerId: z.ZodOptional<z.ZodString>;
    preferences: z.ZodDefault<z.ZodObject<{
        autoOpenCamera: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        autoOpenCamera: boolean;
    }, {
        autoOpenCamera?: boolean | undefined;
    }>>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    tier: "free" | "pro";
    preferences: {
        autoOpenCamera: boolean;
    };
    photoUrl?: string | undefined;
    displayName?: string | undefined;
    subscriptionId?: string | undefined;
    stripeCustomerId?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    email: string;
    photoUrl?: string | undefined;
    displayName?: string | undefined;
    tier?: "free" | "pro" | undefined;
    subscriptionId?: string | undefined;
    stripeCustomerId?: string | undefined;
    preferences?: {
        autoOpenCamera?: boolean | undefined;
    } | undefined;
}>;
export type User = z.infer<typeof UserSchema>;
export declare const VectorDocumentSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    vector: z.ZodArray<z.ZodNumber, "many">;
    metadata: z.ZodRecord<z.ZodString, z.ZodAny>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    text: string;
    vector: number[];
    metadata: Record<string, any>;
}, {
    id: string;
    createdAt: Date;
    text: string;
    vector: number[];
    metadata: Record<string, any>;
}>;
export type VectorDocument = z.infer<typeof VectorDocumentSchema>;
