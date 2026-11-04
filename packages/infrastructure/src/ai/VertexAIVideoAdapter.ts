import { injectable, inject } from 'inversify';
import { IMultimodalUploadAnalyzer, AIAnalysis, AIAnalysisSchema, VideoPrompts } from '@lemonade/core';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { TracingService } from '../observability/TracingService';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { TYPES } from '../di/types';

@injectable()
export class VertexAIVideoAdapter implements IMultimodalUploadAnalyzer {
    private model: GenerativeModel;

    constructor(
        @inject(TYPES.ConfigProvider) private config: IConfigProvider,
        @inject(TYPES.TracingService) private tracer: TracingService,
    ) {
        const fbConfig = this.config.getFirebaseConfig();
        const gcloudConfig = this.config.getGoogleCloudConfig();

        const authOptions = fbConfig.serviceAccountKey
            ? { credentials: JSON.parse(fbConfig.serviceAccountKey) }
            : undefined;

        const vertex = new VertexAI({
            project: gcloudConfig.projectId,
            location: gcloudConfig.location,
            googleAuthOptions: authOptions,
        });

        this.model = vertex.getGenerativeModel({
            model: this.config.getGeminiModel(),
            generationConfig: { responseMimeType: 'application/json' },
            tools: [{ googleSearchRetrieval: {} }],
        });
    }

    async analyzeUploadedVideo(
        videoUri: string,
        context: string,
        mimeType?: string,
        userId?: string,
        sessionId?: string,
    ): Promise<AIAnalysis> {
        const prompt = VideoPrompts.analysis(context);

        const result = await this.tracer.traceAiCall({
            name: 'video_analysis_cloud_function',
            inputs: { videoUri, mimeType, context, userId, sessionId },
            exec: () =>
                this.model.generateContent({
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                { fileData: { fileUri: videoUri, mimeType: mimeType || 'video/mp4' } },
                            ],
                        },
                    ],
                }),
        });

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error('AI returned empty response');

        const groundingMetadata = result.response.candidates?.[0].groundingMetadata;
        if (groundingMetadata) {
            console.log('[VertexAI] Grounding Metadata received:', JSON.stringify(groundingMetadata));
        }

        try {
            return AIAnalysisSchema.parse(JSON.parse(rawText));
        } catch (e: unknown) {
            console.error('Failed to parse AI response', rawText, e);
            throw new Error('Invalid JSON response from AI');
        }
    }

    async analyzeUploadedImage(
        imageUrl: string,
        vehicleContext: string,
        mimeType?: string,
        userId?: string,
        sessionId?: string,
    ): Promise<AIAnalysis> {
        const prompt = VideoPrompts.imageAnalysis(vehicleContext);

        const result = await this.tracer.traceAiCall({
            name: 'image_analysis_cloud_function',
            inputs: { imageUrl, mimeType, vehicleContext, userId, sessionId },
            exec: () =>
                this.model.generateContent({
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                { fileData: { fileUri: imageUrl, mimeType: mimeType || 'image/jpeg' } },
                            ],
                        },
                    ],
                }),
        });

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error('AI returned empty response');

        try {
            return AIAnalysisSchema.parse(JSON.parse(rawText));
        } catch (e: unknown) {
            console.error('Failed to parse AI response', rawText, e);
            throw new Error('Invalid JSON response from AI');
        }
    }

    async countTokens(content: string): Promise<number> {
        const response = await this.model.countTokens({
            contents: [{ role: 'user', parts: [{ text: content }] }],
        });
        return response.totalTokens;
    }
}
