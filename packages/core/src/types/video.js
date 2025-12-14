"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_ANALYSIS_RAW_SCHEMA = void 0;
exports.VIDEO_ANALYSIS_RAW_SCHEMA = {
    type: "OBJECT",
    properties: {
        safety_alert: { type: "BOOLEAN", description: "True if immediate severe danger (fire, crash risk, etc)" },
        severity: { type: "STRING", enum: ["low", "medium", "high", "critical"] },
        diagnosis: { type: "STRING", description: "Technical explanation of the failure" },
        visual_evidence: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List specific visual cues seen in the video"
        },
        acoustic_evidence: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "List specific sounds heard (frequency, type)"
        },
        suggested_actions: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Next steps for the user"
        }
    },
    required: ["safety_alert", "severity", "diagnosis", "visual_evidence", "suggested_actions"]
};
