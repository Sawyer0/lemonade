"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAFETY_RAW_SCHEMA = exports.SafetyAssessmentSchema = void 0;
const zod_1 = require("zod");
exports.SafetyAssessmentSchema = zod_1.z.object({
    safety_score: zod_1.z.number().int().min(1).max(10).describe("1-10 scale of danger"),
    hazards_detected: zod_1.z.array(zod_1.z.enum(["JACK_STAND_MISSING", "HIGH_VOLTAGE", "FUEL_LEAK", "SAFETY_CHECK_FAILED", "NONE"])),
    user_intent: zod_1.z.string(),
    intervention_required: zod_1.z.boolean()
});
// Raw Schema with Property Ordering for Vertex AI SDK
exports.SAFETY_RAW_SCHEMA = {
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
