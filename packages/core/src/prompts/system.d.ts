export declare const SYSTEM_PROMPTS: {
    IDENTITY: string;
    PRIME_DIRECTIVES: string;
    DIAGNOSTIC_PROTOCOL: string;
    CHAT_CONTEXT: (vehicleContext: string, sessionContext: string) => string;
    MANUAL_ANALYSIS_INSTRUCTION: (query: string) => string;
};
