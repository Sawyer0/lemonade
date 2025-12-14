import { z } from 'zod';
export declare const SafetyAssessmentSchema: z.ZodObject<{
    safety_score: z.ZodNumber;
    hazards_detected: z.ZodArray<z.ZodEnum<["JACK_STAND_MISSING", "HIGH_VOLTAGE", "FUEL_LEAK", "SAFETY_CHECK_FAILED", "NONE"]>, "many">;
    user_intent: z.ZodString;
    intervention_required: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    safety_score: number;
    hazards_detected: ("JACK_STAND_MISSING" | "HIGH_VOLTAGE" | "FUEL_LEAK" | "SAFETY_CHECK_FAILED" | "NONE")[];
    user_intent: string;
    intervention_required: boolean;
}, {
    safety_score: number;
    hazards_detected: ("JACK_STAND_MISSING" | "HIGH_VOLTAGE" | "FUEL_LEAK" | "SAFETY_CHECK_FAILED" | "NONE")[];
    user_intent: string;
    intervention_required: boolean;
}>;
export type SafetyAssessment = z.infer<typeof SafetyAssessmentSchema>;
export declare const SAFETY_RAW_SCHEMA: {
    type: string;
    properties: {
        intervention_required: {
            type: string;
        };
        hazards_detected: {
            type: string;
            items: {
                type: string;
                enum: string[];
            };
        };
        safety_score: {
            type: string;
            description: string;
        };
        user_intent: {
            type: string;
        };
    };
    required: string[];
    propertyOrdering: string[];
};
