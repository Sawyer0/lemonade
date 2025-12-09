import { z } from 'zod';

export const AIAnalysisSchema = z.object({
    diagnosis: z.string(),
    visual_evidence: z.array(z.string()),
    acoustic_evidence: z.array(z.string()),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    suggested_actions: z.array(z.string()),
    safety_alert: z.boolean().default(false),
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

export interface VideoProcessingEvent {
    filePath: string;
    contentType: string;
    bucket: string;
}

export const VehicleSpecsSchema = z.object({
    year: z.number(),
    make: z.string(),
    model: z.string(),
    engine: z.string(),
});

export type VehicleSpecs = z.infer<typeof VehicleSpecsSchema>;
