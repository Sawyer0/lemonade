import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { ISafetyAI } from '@/core/interfaces/IAIService';
import { TYPES } from '@/infrastructure/di/types';
import type { ILogger } from '@/core/interfaces/ILogger';
import { CONFIG } from '@/infrastructure/config';
import { SAFETY_RAW_SCHEMA } from '@/core/types/safety';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class SafetyAIAdapter implements ISafetyAI {
    private model: GenerativeModel;

    constructor(@inject(TYPES.Logger) private logger: ILogger) {
        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        const credentials = key ? JSON.parse(key) : {};

        const vertex = new VertexAI({
            project: CONFIG.GCLOUD.PROJECT_ID,
            location: 'us-central1',
            googleAuthOptions: { credentials }
        });

        this.model = vertex.getGenerativeModel({
            model: CONFIG.AI_MODELS.TEXT_INTERFACE,
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE, // Monitor must SEE the danger to judge it
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: SAFETY_RAW_SCHEMA as any
            }
        });
    }

    async assessSafety(prompt: string): Promise<string | null> {
        try {
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
            return text || null;
        } catch (error) {
            this.logger.error('SafetyAIAdapter: Assessment failed', error);
            throw new AppError(ErrorCode.AI_SERVICE_ERROR, 'Safety AI Service Failed');
        }
    }
}
