export type ReasoningEffort = "none" | "low" | "moderate" | "high";
export interface AiGenerationConfig {
    thinkingConfig?: {
        thinkingBudget?: number;
        includeThoughts?: boolean;
    };
    temperature: number;
    responseMimeType?: "text/plain" | "application/json";
}
export interface VerificationResult {
    isVerified: boolean;
    source: string | null;
    reasoning: string;
}
export declare const AI_GENERATION_CONFIGS: {
    LIVE_VIDEO: {
        thinkingConfig: {
            thinkingBudget: number;
            includeThoughts: boolean;
        };
        temperature: number;
        responseMimeType: "application/json";
    };
    MANUAL_READER: {
        thinkingConfig: {
            thinkingBudget: number;
            includeThoughts: boolean;
        };
        temperature: number;
        responseMimeType: "text/plain";
    };
    MANUAL_MODERATE: {
        thinkingConfig: {
            thinkingBudget: number;
            includeThoughts: boolean;
        };
        temperature: number;
        responseMimeType: "text/plain";
    };
    CHAT_BOT: {
        temperature: number;
        responseMimeType: "text/plain";
    };
    CHAT_MODERATE: {
        thinkingConfig: {
            thinkingBudget: number;
            includeThoughts: boolean;
        };
        temperature: number;
        responseMimeType: "text/plain";
    };
    CHAT_HIGH: {
        thinkingConfig: {
            thinkingBudget: number;
            includeThoughts: boolean;
        };
        temperature: number;
        responseMimeType: "text/plain";
    };
    VOICE_COMMAND: {
        temperature: number;
        responseMimeType: "text/plain";
    };
};
