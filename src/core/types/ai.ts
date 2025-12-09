export type ReasoningEffort = "none" | "low" | "moderate" | "high";

export interface AiGenerationConfig {
    thinkingConfig?: {
        thinkingBudget?: number;
        includeThoughts?: boolean;
    };
    temperature?: number;
    responseMimeType?: "text/plain" | "application/json";
}

// Default configs as per the user's table
export const AI_GENERATION_CONFIGS = {
    LIVE_VIDEO: {
        thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "application/json" as const, // For structured output (AIAnalysis)
    },
    MANUAL_READER: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.0,
        responseMimeType: "text/plain" as const,
    },
    MANUAL_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: false
        },
        temperature: 0.1,
        responseMimeType: "text/plain" as const,
    },
    CHAT_BOT: {
        thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: false
        },
        temperature: 0.4,
        responseMimeType: "text/plain" as const,
    },
    CHAT_MODERATE: {
        thinkingConfig: {
            thinkingBudget: 1024,
            includeThoughts: false
        },
        temperature: 0.3,
        responseMimeType: "text/plain" as const,
    },
    CHAT_HIGH: {
        thinkingConfig: {
            thinkingBudget: 2048,
            includeThoughts: false
        },
        temperature: 0.2,
        responseMimeType: "text/plain" as const,
    },
    VOICE_COMMAND: {
        temperature: 0.1,
        responseMimeType: "text/plain" as const,
    }
};
