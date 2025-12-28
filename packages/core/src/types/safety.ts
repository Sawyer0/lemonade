import { z } from 'zod';

// Comprehensive hazard types for automotive diagnostics
export const HazardTypeSchema = z.enum([
    // Existing hazards
    "JACK_STAND_MISSING",
    "HIGH_VOLTAGE",
    "FUEL_LEAK",
    "SAFETY_CHECK_FAILED",
    "NONE",
    // New Phase 1 hazards
    "CARBON_MONOXIDE",
    "AIRBAG_DEPLOYMENT",
    "BRAKE_FAILURE",
    "COOLANT_LEAK",
    "EXHAUST_FUMES",
    "ROTATING_PARTS",
    "HOT_SURFACES",
    "CHEMICAL_EXPOSURE",
    "SUSPENDED_LOAD",
    "PRESSURIZED_SYSTEM",
    "BATTERY_ACID",
    "REFRIGERANT_LEAK",
    "ELECTRICAL_SHORT",
    "UNSTABLE_VEHICLE",
    "FIRE_RISK"
]);

export type HazardType = z.infer<typeof HazardTypeSchema>;

export const SafetyAssessmentSchema = z.object({
    safety_score: z.number().int().min(1).max(10).describe("1-10 scale of danger"),
    hazards_detected: z.array(HazardTypeSchema),
    user_intent: z.string(),
    intervention_required: z.boolean(),
    suggested_output: z.string().optional()
});

export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;

// Raw Schema with Property Ordering for Vertex AI SDK
export const SAFETY_RAW_SCHEMA = {
    type: "OBJECT",
    properties: {
        intervention_required: { type: "BOOLEAN" },
        hazards_detected: {
            type: "ARRAY",
            items: {
                type: "STRING",
                enum: [
                    "JACK_STAND_MISSING", "HIGH_VOLTAGE", "FUEL_LEAK", "SAFETY_CHECK_FAILED", "NONE",
                    "CARBON_MONOXIDE", "AIRBAG_DEPLOYMENT", "BRAKE_FAILURE", "COOLANT_LEAK", "EXHAUST_FUMES",
                    "ROTATING_PARTS", "HOT_SURFACES", "CHEMICAL_EXPOSURE", "SUSPENDED_LOAD", "PRESSURIZED_SYSTEM",
                    "BATTERY_ACID", "REFRIGERANT_LEAK", "ELECTRICAL_SHORT", "UNSTABLE_VEHICLE", "FIRE_RISK"
                ]
            }
        },
        safety_score: { type: "INTEGER", description: "1-10 scale of danger" },
        user_intent: { type: "STRING" },
        suggested_output: { type: "STRING" }
    },
    required: ["safety_score", "hazards_detected", "intervention_required", "user_intent"],
    propertyOrdering: ["intervention_required", "hazards_detected", "safety_score", "user_intent", "suggested_output"]
};

