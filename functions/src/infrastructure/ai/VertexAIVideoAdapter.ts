import { injectable } from 'inversify';
import { IVideoDiagnosticAI } from '../../core/interfaces/IAIService';
import { AIAnalysis, AIAnalysisSchema } from '../../core/types/models';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { CONFIG } from '../../config';
import { SYSTEM_PROMPTS } from '../../constants';

@injectable()
export class VertexAIVideoAdapter implements IVideoDiagnosticAI {
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

    async analyzeVideo(videoUri: string, mimeType: string, context: string): Promise<AIAnalysis> {
        const prompt = SYSTEM_PROMPTS.VIDEO_ANALYSIS(context);

        const result = await this.model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { fileData: { fileUri: videoUri, mimeType } },
                ],
            }],
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
}