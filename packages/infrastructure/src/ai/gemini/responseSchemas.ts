import { SchemaType } from '@google-cloud/vertexai';

/** Structured-output schema for an uploaded photo or video diagnosis (mirrors AIAnalysisSchema). */
export const ANALYSIS_RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        safety_alert: { type: SchemaType.BOOLEAN },
        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
        diagnosis: { type: SchemaType.STRING },
        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        engineDescription: { type: SchemaType.STRING },
        isStock: { type: SchemaType.BOOLEAN },
        visualConflictDetected: { type: SchemaType.BOOLEAN },
        detectedCondition: {
            type: SchemaType.STRING,
            enum: ['clean', 'rust', 'leak', 'broken', 'modified', 'unknown'],
        },
        confidence: { type: SchemaType.NUMBER },
        verification: {
            type: SchemaType.OBJECT,
            properties: {
                isVerified: { type: SchemaType.BOOLEAN },
                verifiedSource: { type: SchemaType.STRING, nullable: true },
                conflictingEvidence: { type: SchemaType.STRING, nullable: true },
            },
            required: ['isVerified'],
        },
    },
    required: [
        'safety_alert',
        'severity',
        'diagnosis',
        'visual_evidence',
        'acoustic_evidence',
        'suggested_actions',
        'engineDescription',
        'isStock',
        'visualConflictDetected',
        'detectedCondition',
        'confidence',
    ],
};

/** Structured-output schema for a fact-check of a diagnostic hypothesis. */
export const VERIFICATION_RESPONSE_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        isVerified: { type: SchemaType.BOOLEAN },
        source: { type: SchemaType.STRING, nullable: true },
        reasoning: { type: SchemaType.STRING },
    },
    required: ['isVerified', 'reasoning'],
};
