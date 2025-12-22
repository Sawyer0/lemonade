import { z } from 'zod';

export const ToolCallTypeSchema = z.enum([
    'google_search',
    'start_video_stream',
    'display_content',
    'verify_safe_support',
    'inspect_vehicle_component' // Deprecated in favor of unified
]);

export const GoogleSearchArgsSchema = z.object({
    query: z.string()
});

export const StartVideoStreamArgsSchema = z.object({
    reason: z.string(),
    targetComponent: z.string().optional(),
    focusArea: z.enum(['engine_bay', 'undercarriage', 'interior', 'exterior', 'specific_component'])
});

export const DisplayContentArgsSchema = z.object({
    title: z.string(),
    url: z.string().url(),
    type: z.enum(['image', 'pdf', 'html'])
});

export const VerifySafeSupportArgsSchema = z.object({
    reason: z.string(),
    required_equipment: z.array(z.string()).optional()
});

export type GoogleSearchArgs = z.infer<typeof GoogleSearchArgsSchema>;
export type StartVideoStreamArgs = z.infer<typeof StartVideoStreamArgsSchema>;
export type DisplayContentArgs = z.infer<typeof DisplayContentArgsSchema>;
export type VerifySafeSupportArgs = z.infer<typeof VerifySafeSupportArgsSchema>;
