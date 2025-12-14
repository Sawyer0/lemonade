import { injectable } from 'inversify';
import { IMultimodalUploadAnalyzer, AIAnalysis, AIAnalysisSchema, VIDEO_PROMPTS } from '@lemonade/core';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { CONFIG } from '../../config';
import { traceAiCall } from '../observability/langsmithTracer'; // Import tracer

@injectable()
export class VertexAIVideoAdapter implements IMultimodalUploadAnalyzer {
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

        // Initialize with Grounding Tools
        this.model = vertex.getGenerativeModel({
            model: CONFIG.GEMINI_THINKING_MODEL,
            generationConfig: { responseMimeType: 'application/json' },
            tools: [{ googleSearchRetrieval: {} }] // ENABLED: Google Search Grounding
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async analyzeUploadedVideo(videoUri: string, context: string, mimeType?: string, userId?: string, sessionId?: string): Promise<AIAnalysis> {
        const prompt = VIDEO_PROMPTS.ANALYSIS(context);

        const result = await traceAiCall({
            name: 'video_analysis_cloud_function',
            inputs: { videoUri, mimeType, context },
            exec: () => this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { fileUri: videoUri, mimeType: mimeType || 'video/mp4' } },
                    ],
                }],
            })
        });

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error("AI returned empty response");

        // Log Grounding Metadata if present (Proof of Search)
        const groundingMetadata = result.response.candidates?.[0].groundingMetadata;
        if (groundingMetadata) {
            console.log("[VertexAI] Grounding Metadata received:", JSON.stringify(groundingMetadata));
        }

        try {
            return AIAnalysisSchema.parse(JSON.parse(rawText));
        } catch (e) {
            console.error("Failed to parse AI response", rawText);
            throw new Error("Invalid JSON response from AI");
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async analyzeUploadedImage(imageUrl: string, vehicleContext: string, mimeType?: string, userId?: string, sessionId?: string): Promise<AIAnalysis> {
        const prompt = VIDEO_PROMPTS.IMAGE_ANALYSIS(vehicleContext);

        const result = await traceAiCall({
            name: 'image_analysis_cloud_function',
            inputs: { imageUrl, mimeType, vehicleContext },
            exec: () => this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { fileUri: imageUrl, mimeType: mimeType || 'image/jpeg' } },
                    ],
                }],
            })
        });

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error("AI returned empty response");

        try {
            return AIAnalysisSchema.parse(JSON.parse(rawText));
        } catch (e) {
            console.error("Failed to parse AI response", rawText);
            throw new Error("Invalid JSON response from AI");
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async countTokens(content: string): Promise<number> {
        const response = await this.model.countTokens({
            contents: [{ role: 'user', parts: [{ text: content }] }]
        });
        return response.totalTokens;
    }
}

