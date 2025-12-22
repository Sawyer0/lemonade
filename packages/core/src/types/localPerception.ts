import { z } from 'zod';

export const LocalDetectionSchema = z.object({
    objectId: z.string().describe("Identifier of the detected car part (e.g., 'battery', 'alternator')"),
    confidence: z.number().min(0).max(1),
    bbox: z.array(z.number()).length(4).optional().describe("[x, y, width, height] relative to frame"),
    state: z.string().optional().describe("Physical state detected (e.g., 'corroded', 'loose')"),
    lastSeen: z.number().describe("Timestamp of last detection"),
    steadyStrikeCount: z.number().describe("Number of consecutive frames seen"),
    metadata: z.record(z.any()).optional()
});

export type LocalDetection = z.infer<typeof LocalDetectionSchema>;

export const LocalTriageResultSchema = z.object({
    detections: z.array(LocalDetectionSchema),
    bestFramePath: z.string().optional().describe("Path to the highest-confidence frame on local disk"),
    highestConfidenceId: z.string().optional(),
    timestamp: z.number()
});

export type LocalTriageResult = z.infer<typeof LocalTriageResultSchema>;

export interface ILocalPerceptionService {
    /**
     * Loads the model into memory with optimized native configuration.
     */
    initialize(modelPath: string): Promise<void>;

    /**
     * Performs inference on a single frame.
     * @param framePath Path to the image file on local storage.
     */
    triageFrame(framePath: string): Promise<LocalDetection[]>;

    /**
     * Frees resources.
     */
    dispose(): Promise<void>;

    /**
     * Returns true if initialized and ready for inference.
     */
    isReady(): boolean;
}
