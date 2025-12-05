import { z } from 'zod';

export const SafetyAssessmentSchema = z.object({
    safety_score: z.number().int().min(1).max(10).describe("1-10 scale of danger"),
    hazards_detected: z.array(z.enum(["JACK_STAND_MISSING", "HIGH_VOLTAGE", "FUEL_LEAK", "SAFETY_CHECK_FAILED", "NONE"])),
    user_intent: z.string(),
    intervention_required: z.boolean()
});

export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;

// Raw Schema with Property Ordering for Vertex AI SDK
export const SAFETY_RAW_SCHEMA = {
    type: "OBJECT",
    properties: {
        intervention_required: { type: "BOOLEAN" },
        hazards_detected: {
            type: "ARRAY",
            items: { type: "STRING", enum: ["JACK_STAND_MISSING", "HIGH_VOLTAGE", "FUEL_LEAK", "SAFETY_CHECK_FAILED", "NONE"] }
        },
        safety_score: { type: "INTEGER", description: "1-10 scale of danger" },
        user_intent: { type: "STRING" }
    },
    required: ["safety_score", "hazards_detected", "intervention_required", "user_intent"],
    propertyOrdering: ["intervention_required", "hazards_detected", "safety_score", "user_intent"]
};
