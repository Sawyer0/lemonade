import { injectable } from 'inversify';
import { ISafetyAI } from '@lemonade/core';
import { VertexAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import { CONFIG } from '../../config';

@injectable()
export class VertexAISafetyAdapter implements ISafetyAI {
    private model: GenerativeModel;

    constructor() {
        const authOptions = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? { credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) }
            : undefined;

        const vertex = new VertexAI({
            project: CONFIG.GCLOUD_PROJECT,
            location: CONFIG.LOCATION,
            googleAuthOptions: authOptions
        });

        this.model = vertex.getGenerativeModel({
            model: CONFIG.GEMINI_THINKING_MODEL,
            generationConfig: { responseMimeType: 'application/json' },
            // Explicitly disable standard filters to allow our custom "Industrial Safety" logic to run
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
        });
    }

    async assessSafety(prompt: string): Promise<string> {
        const result = await this.model.generateContent(prompt);
        return result.response.candidates?.[0].content.parts[0].text || "";
    }
}
