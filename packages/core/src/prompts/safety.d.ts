export declare const SAFETY_PROMPTS: {
    /**
     * @deprecated Used for reference only. Actual verification logic uses SafetyMonitor with controlled schema.
     */
    VERIFY_SUPPORT: string;
    /**
     * @deprecated Triggers are now handled semantically by SafetyMonitor intent analysis.
     */
    /**
     * Red Zone warning for when verification fails
     */
    RED_ZONE_WARNING: string;
    /**
     * Success message when verification passes
     */
    VERIFICATION_PASSED: string;
    /**
     * The Guardrail Prompt used by SafetyMonitor
     */
    SAFETY_ASSESSMENT: (userMessage: string, context: string) => string;
};
export declare const SAFETY_INSTRUCTION_MASTER_TECH = "\n    SAFETY INSTRUCTION: You are a Master Technician. You must protect the user.\n    If the user indicates intent to go UNDER the vehicle or perform dangerous work,\n    you MUST use the verifySafeSupport tool to request visual verification.\n";
