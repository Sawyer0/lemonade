export class VideoPrompts {
    /**
     * Generates the prompt for structured video analysis.
     */
    static analysis(vehicleContext: string): string {
        return `
Analyze this video of a ${vehicleContext}.

STRICT VISUAL ONLY RULE:
- Describe ONLY what you see. Do not infer hidden internal damage.
- If the video is dark, blurry, or does not show the component, return "diagnosis": "Insufficient Visual Data".
- Do not guess the mileage or service history.

Output JSON matching this schema:
{
  "diagnosis": "Technical explanation of the failure",
  "visual_evidence": ["List specific visual cues"],
  "acoustic_evidence": ["List specific sounds"],
  "severity": "low|medium|high|critical",
  "suggested_actions": ["Next steps"],
  "safety_alert": boolean (True if immediate danger/fire/crash risk),
  "engineDescription": "Brief description of the visual scene (e.g. 'Stock 5.0L Coyote V8 with aftermarket intake')",
  "isStock": boolean,
  "visualConflictDetected": boolean,
  "detectedCondition": "clean|rust|leak|broken|modified|unknown",
  "confidence": number (0.0 to 1.0)
}
`.trim();
    }

    /**
     * Generates the prompt for live video frame analysis.
     */
    static liveImageAnalysis(vehicleContext: string): string {
        return `
You are analyzing a LIVE video frame of a ${vehicleContext}.
STRICT VISUAL ONLY RULE: Describe only what is visible in this single frame.
Output JSON matching the standard AIAnalysis schema.
`.trim();
    }

    /**
     * Generates the prompt for live audio analysis.
     */
    static liveAudioAnalysis(vehicleContext: string): string {
        return `
You are analyzing a LIVE audio chunk from a ${vehicleContext}.
Diagnose based on sound patterns (knocking, hissing, grinding).
Output JSON matching the standard AIAnalysis schema.
`.trim();
    }

    /**
     * Generates the prompt for static image analysis.
     */
    static imageAnalysis(vehicleContext: string): string {
        return `
Analyze this image of a ${vehicleContext}.

STRICT VISUAL ONLY RULE:
- Describe ONLY what you see in this static image. Do not infer hidden internal damage.
- If the image is dark, blurry, or does not show the component, return "diagnosis": "Insufficient Visual Data".

Output JSON matching this schema:
{
  "diagnosis": "Technical explanation of the failure",
  "visual_evidence": ["List specific visual cues"],
  "acoustic_evidence": [],
  "severity": "low|medium|high|critical",
  "suggested_actions": ["Next steps"],
  "safety_alert": boolean (True if immediate danger/fire/crash risk),
  "engineDescription": "Brief description of the visual scene",
  "isStock": boolean,
  "visualConflictDetected": boolean,
  "detectedCondition": "clean|rust|leak|broken|modified|unknown",
  "confidence": number (0.0 to 1.0)
}
`.trim();
    }
}
