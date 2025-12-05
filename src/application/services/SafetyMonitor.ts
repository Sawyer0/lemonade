import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { CONFIG } from '@/infrastructure/config';
import { SafetyAssessment, SAFETY_RAW_SCHEMA } from '@/core/types/safety';
import { ISafetyMonitor } from '@/core/interfaces/ISafetyMonitor';
import type { ILogger } from '@/core/interfaces/ILogger';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class SafetyMonitor implements ISafetyMonitor {
    private vertex: VertexAI;
    private model: GenerativeModel;
    private logger: ILogger;

    constructor(@inject(TYPES.Logger) logger: ILogger) {
        this.logger = logger;

        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const credentials = key ? JSON.parse(key) : {};

        this.vertex = new VertexAI({
            project: CONFIG.GCLOUD_PROJECT,
            location: 'us',
            googleAuthOptions: { credentials }
        });

        this.model = this.vertex.getGenerativeModel({
            model: CONFIG.AI_MODELS.PRIMARY,
            generationConfig: {
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: SAFETY_RAW_SCHEMA as any // Cast because propertyOrdering might not be in generic SchemaType yet
            }
        });
    }

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

            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;

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
            if (cleanText.startsWith('```')) {
                cleanText = cleanText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
            }

            return JSON.parse(cleanText) as SafetyAssessment;
        } catch (error) {
            this.logger.error("SafetyMonitor Assessment Failed", error, { userMessage });
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
