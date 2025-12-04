/**
 * Safety Prompts Module
 * 
 * Contains prompts for the Safety 2.0 Visual Verification system.
 * These prompts guide the AI in actively verifying dangerous situations.
 */

export const SAFETY_PROMPTS = {
    /**
     * Used when the AI detects a potentially dangerous situation
     * and needs to verify safety equipment/conditions.
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
     * Phrases that trigger safety verification
     */
    TRIGGER_PHRASES: [
        "going under the car",
        "crawling under",
        "getting under",
        "underneath the vehicle",
        "under the engine",
        "jacking up",
        "lifting the car"
    ],

    /**
     * Red Zone warning for when verification fails
     */
    RED_ZONE_WARNING: `🚨 SAFETY ALERT: I cannot verify proper jack stand support.

NEVER work under a vehicle supported only by a hydraulic jack. Hydraulic jacks can fail without warning.

Before proceeding:
1. Place jack stands on solid, level ground
2. Lower the vehicle onto the jack stands
3. Verify stability by gently pushing the vehicle
4. Keep the hydraulic jack in place as a backup

Show me your jack stands and I'll verify before you continue.`,

    /**
     * Success message when verification passes
     */
    VERIFICATION_PASSED: `✅ I can see proper jack stand support. 

The vehicle appears safely secured. Remember:
- Never exceed the rated capacity
- Keep limbs clear of pinch points
- Have someone nearby when possible

You're clear to proceed. I'm here if you need guidance.`
};
