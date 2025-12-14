export declare const VIDEO_ANALYSIS_RAW_SCHEMA: {
    type: string;
    properties: {
        safety_alert: {
            type: string;
            description: string;
        };
        severity: {
            type: string;
            enum: string[];
        };
        diagnosis: {
            type: string;
            description: string;
        };
        visual_evidence: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
        acoustic_evidence: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
        suggested_actions: {
            type: string;
            items: {
                type: string;
            };
            description: string;
        };
    };
    required: string[];
};
