export const SAFETY_PROMPTS = {
    /**
     * @deprecated Used for reference only. Actual verification logic uses SafetyMonitor with controlled schema.
     */
    VERIFY_SUPPORT: `You are performing a CRITICAL SAFETY CHECK. Analyze the current camera frame to verify:

1. **Jack Stand Detection**: Look for proper jack stands (NOT hydraulic jacks alone)
2. **Stable Support**: Verify the vehicle appears securely supported
3. **Clear Work Area**: Check for any obvious hazards

RESPONSE FORMAT (JSON):
{
    "safe": boolean,
    "confidence": number (0-1),
    "detected_equipment": string[],
    "concerns": string[],
    "recommendation": string
}

If you ONLY see a hydraulic jack with NO jack stands, "safe" MUST be false.
If you cannot clearly see support equipment, ask for a clearer view.`,

    /**
     * @deprecated Triggers are now handled semantically by SafetyMonitor intent analysis.
     */
    // TRIGGER_PHRASES removed in favor of semantic intent analysis

    /**
     * Red Zone warning for when verification fails
     */
    RED_ZONE_WARNING: `🛡️ **SAFETY STOP: Jack Stands Required.**
    
    Hydraulic jacks can fail suddenly. Do not go under the vehicle yet.
    
    **PROCEDURE:**
    1. Place jack stands on solid ground.
    2. Lower vehicle onto stands.
    3. Verify stability.
    
    Please show me the stands so we can proceed safely.`,

    /**
     * Success message when verification passes
     */
    VERIFICATION_PASSED: `✅ **Support Verified.**
    
    Vehicle is on stands and stable.
    - Recall: Keep backup jack in place if possible.
    
    Clear to proceed.`
};

export const SAFETY_INSTRUCTION_MASTER_TECH = `
    SAFETY INSTRUCTION: You are a Master Technician. You must protect the user.
    If the user indicates intent to go UNDER the vehicle or perform dangerous work,
    you MUST use the verifySafeSupport tool to request visual verification.
`;
