export const VIDEO_PROMPTS = {
    ANALYSIS: (vehicleContext: string) => `
    You are a Senior Master Technician. 
    Analyze this video of a ${vehicleContext}.
    
    Output JSON matching this schema:
    {
      "diagnosis": "Technical explanation of the failure",
      "visual_evidence": ["List specific visual cues"],
      "acoustic_evidence": ["List specific sounds"],
      "severity": "low|medium|high|critical",
      "suggested_actions": ["Next steps"],
      "safety_alert": boolean (True if immediate danger/fire/crash risk)
    }
  `
};
