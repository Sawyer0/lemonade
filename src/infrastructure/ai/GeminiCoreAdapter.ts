import { injectable, inject } from 'inversify';
import { VertexAI, GenerativeModel, Tool, HarmCategory, HarmBlockThreshold, SafetySetting } from '@google-cloud/vertexai'; // Added SafetySetting
import { CONFIG } from '@/infrastructure/config';
import {
    AppError,
    ErrorCode,
    ILogger
} from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

import { VERIFY_SAFE_SUPPORT_TOOL } from '@/app/server-tools/tools/verifySafeSupport';
import { START_VIDEO_STREAM_TOOL } from '@/app/server-tools/tools/startVideoStream';
import { DISPLAY_CONTENT_TOOL } from '@/app/server-tools/tools/displayContent';
import { GOOGLE_SEARCH_TOOL } from '@/app/server-tools/tools/googleSearch';

@injectable()

@injectable()
export class GeminiCoreAdapter {
    private vertex: VertexAI;
    public readonly commonSafetySettings: SafetySetting[];
    public readonly commonTools: Tool[];

    constructor(
        @inject(TYPES.Logger) private logger: ILogger
    ) {
        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (!key) {
            this.logger.error('CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY is missing in GeminiCoreAdapter', {}, undefined);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'FIREBASE_SERVICE_ACCOUNT_KEY is missing');
        }

        try {
            const credentials = JSON.parse(key);
            this.logger.debug('Service Account Email', { email: credentials.client_email });

            const authOptions = { credentials };

            this.vertex = new VertexAI({
                project: CONFIG.GCLOUD.PROJECT_ID,
                location: 'us-central1',
                googleAuthOptions: authOptions
            });

            this.commonSafetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
            ];

            this.commonTools = [{
                functionDeclarations: [VERIFY_SAFE_SUPPORT_TOOL, DISPLAY_CONTENT_TOOL, START_VIDEO_STREAM_TOOL, GOOGLE_SEARCH_TOOL]
            }];

            this.logger.info('GeminiCoreAdapter initialized as a model factory.');

        } catch (error) {
            this.logger.error('Failed to initialize GeminiCoreAdapter (VertexAI client)', error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to initialize AI Adapter Core');
        }
    }

    public getGenerativeModel(modelId: string, tools?: Tool[], safetySettings?: SafetySetting[]): GenerativeModel {
        this.logger.info(`Getting GenerativeModel for model: ${modelId}`);
        return this.vertex.getGenerativeModel({
            model: modelId,
            safetySettings: safetySettings || this.commonSafetySettings,
            tools: tools || this.commonTools
        });
    }
}
