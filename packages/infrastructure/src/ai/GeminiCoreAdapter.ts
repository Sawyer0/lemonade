import { injectable, inject } from 'inversify';
import {
    VertexAI,
    GenerativeModel,
    Tool,
    HarmCategory,
    HarmBlockThreshold,
    SafetySetting,
} from '@google-cloud/vertexai';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import type { ILogger } from '@lemonade/core';
import { AppError, ErrorCode } from '@lemonade/core';
import { TYPES } from '../di/types';

import { VERIFY_SAFE_SUPPORT_TOOL } from './tools/verifySafeSupport';
import { START_VIDEO_STREAM_TOOL } from './tools/startVideoStream';
import { DISPLAY_CONTENT_TOOL } from './tools/displayContent';
import { GOOGLE_SEARCH_TOOL } from './tools/googleSearch';

@injectable()
export class GeminiCoreAdapter {
    private vertex: VertexAI;
    public readonly commonSafetySettings: SafetySetting[];
    public readonly commonTools: Tool[];

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.ConfigProvider) private config: IConfigProvider,
    ) {
        const key = this.config.getFirebaseConfig().serviceAccountKey;

        try {
            // An explicit service account key wins; without one the Vertex client uses
            // Application Default Credentials, the same as the other Vertex adapters.
            const authOptions = key ? { credentials: JSON.parse(key) } : undefined;
            if (authOptions) {
                this.logger.debug('Service Account Email', { email: authOptions.credentials.client_email });
            } else {
                this.logger.info('GeminiCoreAdapter: no service account key, using Application Default Credentials');
            }

            const gcloudConfig = this.config.getGoogleCloudConfig();

            this.vertex = new VertexAI({
                project: gcloudConfig.projectId,
                location: gcloudConfig.location || 'us-central1',
                googleAuthOptions: authOptions,
            });

            this.commonSafetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
                },
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                },
            ];

            this.commonTools = [
                {
                    functionDeclarations: [
                        VERIFY_SAFE_SUPPORT_TOOL,
                        DISPLAY_CONTENT_TOOL,
                        START_VIDEO_STREAM_TOOL,
                        GOOGLE_SEARCH_TOOL,
                    ],
                },
            ];

            this.logger.info('GeminiCoreAdapter initialized as a model factory.');
        } catch (error) {
            this.logger.error('Failed to initialize GeminiCoreAdapter (VertexAI client)', error as Error);
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Failed to initialize AI Adapter Core');
        }
    }

    public getGenerativeModel(modelId: string, tools?: Tool[], safetySettings?: SafetySetting[]): GenerativeModel {
        this.logger.info(`Getting GenerativeModel for model: ${modelId}`);
        return this.vertex.getGenerativeModel({
            model: modelId,
            safetySettings: safetySettings || this.commonSafetySettings,
            tools: tools || this.commonTools,
        });
    }
}
