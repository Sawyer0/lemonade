import { injectable, inject } from 'inversify';
import { SafetyAssessment } from '@/core/types/safety';
import type { ISafetyMonitor } from '@/core/interfaces/ISafetyMonitor';
import type { ISafetyAI } from '@/core/interfaces/IAIService';
import type { ILogger } from '@/core/interfaces/ILogger';
import { TYPES } from '@/infrastructure/di/types';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class SafetyMonitor implements ISafetyMonitor {
    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.SafetyAI) private safetyAI: ISafetyAI
    ) { }

    async assess(userMessage: string, context: string): Promise<SafetyAssessment> {
        try {
            const prompt = `
            Analyze the following user message and vehicle context for immediate safety hazards based on the Master Tech Constitution.
            
            CONTEXT:
            ${context}
            
            USER MESSAGE:
            "${userMessage}"
            
            CRITICAL CHECKS (Immediate Intervention Required):
            1. LIFE SAFETY: Intent to work under vehicle (Jack stand verification required).
            2. HIGH VOLTAGE: Handling orange cabling or HV battery components (Hard Stop).
            3. RED ZONES: Work on Airbags (SRS), High Pressure Fuel, or Brake Hydraulics (requires Procedure Stop).
            
            NUANCE GUIDELINES:
            - INSPECTION IS SAFE: "Looking at tires", "checking brakes", "inspecting suspension" is SAFE unless the user explicitly says they are going UNDER the car.
            - CAMERA USE IS SAFE: "Opening camera", "showing you" is SAFE.
            - TIRE CHECK IS SAFE: Checking tread, pressure, or sidewall is SAFE.
            
            If the user is merely inspecting or asking for analysis, returning "NONE" for hazards.
            `;

            const text = await this.safetyAI.assessSafety(prompt);

            if (!text) {
                this.logger.warn('SafetyMonitor: No response text received', { userMessage });
                return {
                    safety_score: 1,
                    hazards_detected: ["NONE"],
                    user_intent: "Unknown",
                    intervention_required: false
                };
            }

            let cleanText = text.trim();
            // Remove markdown code blocks if present
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

            try {
                return JSON.parse(cleanText) as SafetyAssessment;
            } catch (e) {
                this.logger.warn(`SafetyMonitor: Failed to parse JSON response: ${cleanText}`, { error: e });
                throw new AppError(ErrorCode.AI_SERVICE_ERROR, "Invalid JSON response from Safety Guardrail");
            }
        } catch (error) {
            this.logger.error("SafetyMonitor Assessment Failed", error as Error, { userMessage });
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
