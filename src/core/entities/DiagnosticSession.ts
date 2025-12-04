import { z } from 'zod';

// --- Value Objects ---

export const AIAnalysisSchema = z.object({
    diagnosis: z.string(),
    visual_evidence: z.array(z.string()), // "Smoke from valve cover"
    acoustic_evidence: z.array(z.string()), // "Rhythmic clicking at 4Hz"
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    suggested_actions: z.array(z.string()),
    safety_alert: z.boolean().default(false), // The "Safety Stop" trigger
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

// --- Entities ---

export const DiagnosticSessionSchema = z.object({
    id: z.string().uuid(),
    vehicleId: z.string(),
    status: z.enum(['active', 'analyzing', 'waiting_user', 'completed']),

    // The "Medical Chart"
    complaint: z.string(),
    obdCodes: z.array(z.string()).default([]),

    // Multimodal Data
    videoUrl: z.string().url().optional(), // The raw file
    aiAnalysis: AIAnalysisSchema.nullable(), // The "Translation"

    messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
        timestamp: z.date()
    })),

    updatedAt: z.date(),
    startedAt: z.date(),
});

export type DiagnosticSession = z.infer<typeof DiagnosticSessionSchema>;
