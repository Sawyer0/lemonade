import { injectable, inject } from 'inversify';
import { ISafetyAI } from '@lemonade/core';
import { VertexAI, GenerativeModel, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { TYPES } from '../di/types';

@injectable()
export class VertexAISafetyAdapter implements ISafetyAI {
    private model: GenerativeModel;

    constructor(
        @inject(TYPES.ConfigProvider) private config: IConfigProvider
    ) {
        const fbConfig = this.config.getFirebaseConfig();
        const gcloudConfig = this.config.getGoogleCloudConfig();

        const authOptions = fbConfig.serviceAccountKey
            ? { credentials: JSON.parse(fbConfig.serviceAccountKey) }
            : undefined;

        const vertex = new VertexAI({
            project: gcloudConfig.project,
            location: gcloudConfig.location,
            googleAuthOptions: authOptions
        });

        this.model = vertex.getGenerativeModel({
            model: this.config.getGeminiModel(),
            generationConfig: { responseMimeType: 'application/json' },
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
