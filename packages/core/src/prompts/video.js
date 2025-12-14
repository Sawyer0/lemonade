"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_PROMPTS = void 0;
exports.VIDEO_PROMPTS = {
    ANALYSIS: (vehicleContext) => `
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
  `,
    LIVE_IMAGE_ANALYSIS: (vehicleContext) => `
    You are analyzing a LIVE video frame of a ${vehicleContext}.
    STRICT VISUAL ONLY RULE: Describe only what is visible in this single frame.
    Output JSON matching the standard AIAnalysis schema.
  `,
    LIVE_AUDIO_ANALYSIS: (vehicleContext) => `
    You are analyzing a LIVE audio chunk from a ${vehicleContext}.
    Diagnose based on sound patterns (knocking, hissing, grinding).
    Output JSON matching the standard AIAnalysis schema.
  `,
    IMAGE_ANALYSIS: (vehicleContext) => `
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
  `
};
