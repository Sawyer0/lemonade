import { injectable, inject } from 'inversify';
import { SafetyAssessment } from '../../core/types/safety';
import type { ISafetyMonitor } from '../../core/interfaces/ISafetyMonitor';
import type { ISafetyAI } from '../../core/interfaces/IAIService';
import { TYPES } from '../../infrastructure/di/types';

@injectable()
export class SafetyMonitor implements ISafetyMonitor {
    constructor(
        @inject(TYPES.SafetyAI) private safetyAI: ISafetyAI
    ) { }

    async assess(userMessage: string, context: string): Promise<SafetyAssessment> {
        try {
            const prompt = `
            Analyze the following input for immediate safety hazards based on the Master Tech Constitution.
            
            CONTEXT:
            ${context}
            
            INPUT:
            "${userMessage}"
            
            CRITICAL CHECKS (Immediate Intervention Required):
            1. LIFE SAFETY: Intent to work under vehicle (Jack stand verification required).
            2. HIGH VOLTAGE: Handling orange cabling or HV battery components (Hard Stop).
            3. RED ZONES: Work on Airbags (SRS), High Pressure Fuel, or Brake Hydraulics (requires Procedure Stop).
            
            Output JSON matching this schema:
            {
                "safety_score": number (1-10),
                "hazards_detected": string[],
                "user_intent": string,
                "intervention_required": boolean
            }
            `;

            const text = await this.safetyAI.assessSafety(prompt);

            if (!text) throw new Error("Empty Safety Response");

            let cleanText = text.trim();
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

            return JSON.parse(cleanText) as SafetyAssessment;
        } catch (error) {
            console.error("SafetyMonitor Assessment Failed", error);
            // Fail closed: block operation when safety check fails
            return {
                safety_score: 10,
                hazards_detected: ["SAFETY_CHECK_FAILED"],
                user_intent: "Unable to assess safety due to system error",
                intervention_required: true
            };
        }
    }
}
