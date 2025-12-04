import { injectable } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import { AIAnalysis, AIAnalysisSchema } from '@/core/types/models';
import { SYSTEM_PROMPTS } from '@/core/constants/prompts';

@injectable()
export class GeminiProAdapter implements IVideoDiagnosticAI {
    private model: GenerativeModel;

    constructor(projectId: string) {
        const vertex = new VertexAI({ project: projectId, location: 'us-central1' });

        this.model = vertex.getGenerativeModel({
            model: 'gemini-1.5-pro-preview-0514',
            generationConfig: { responseMimeType: 'application/json' }
        });
    }

    async analyzeMechanicalVideo(videoUrl: string, vehicleContext: string): Promise<AIAnalysis> {
        const prompt = SYSTEM_PROMPTS.VIDEO_ANALYSIS(vehicleContext);

        const result = await this.model.generateContent([
            prompt,
            { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' } }
        ]);

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error("AI returned empty response");

        return AIAnalysisSchema.parse(JSON.parse(rawText));
    }
}
