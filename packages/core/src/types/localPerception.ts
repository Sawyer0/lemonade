import { z } from 'zod';

export const SemanticTriageResultSchema = z.object({
    id: z.object({
        obj: z.string().describe("Identifier of the detected car part (e.g., 'Brake Rotor')"),
        cat: z.string().describe("System Category (e.g., 'Braking', 'Suspension')")
    }),
    eval: z.object({
        stat: z.enum(['NORMAL', 'CAUTION', 'CRITICAL', 'UNCERTAIN']).describe("Condition status"),
        risk: z.boolean().describe("True if safety risk detected"),
        note: z.string().describe("Brief visual reason for assessment")
    }),
    confidence: z.number().min(0).max(1).optional().describe("Confidence score of the VLM output"),
    bbox: z.array(z.number()).length(4).optional().describe("[x, y, width, height] relative to frame"),
    timestamp: z.number().optional().describe("Timestamp of detection"),
    steadyStrikeCount: z.number().optional().describe("Number of consecutive frames seen")
});

export type SemanticTriageResult = z.infer<typeof SemanticTriageResultSchema>;

export const LocalTriageResultSchema = z.object({
    detections: z.array(SemanticTriageResultSchema),
    bestFramePath: z.string().optional().describe("Path to the highest-confidence frame on local disk"),
    highestConfidenceId: z.string().optional(),
    timestamp: z.number(),
    // Diagnosis summary from local model (SmolVLM2)
    confidence: z.number().min(0).max(1).optional().describe("Overall confidence in the local diagnosis"),
    primaryIssue: z.string().optional().describe("Main issue detected by local model"),
    reasoning: z.string().optional().describe("Local model's reasoning for the diagnosis"),
    safetyConcern: z.boolean().optional().describe("True if any safety risk detected"),
    componentsMentioned: z.array(z.string()).optional().describe("List of components mentioned in diagnosis")
});

export type LocalTriageResult = z.infer<typeof LocalTriageResultSchema>;

export interface ILocalPerceptionService {
    /**
     * Loads the model into memory with optimized native configuration.
     */
    initialize(modelPath: string): Promise<void>;

    /**
     * Runs a dummy inference to prime the NPU/GPU for faster first real inference.
     */
    warmup(): Promise<void>;

    /**
     * Performs inference on a single frame.
     * @param framePath Path to the image file on local storage.
     */
    triageFrame(framePath: string): Promise<SemanticTriageResult[]>;

    /**
     * Frees resources.
     */
    dispose(): Promise<void>;

    /**
     * Returns true if initialized and ready for inference.
     */
    isReady(): boolean;
}
