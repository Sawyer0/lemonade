import { injectable } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import { AIAnalysis, AIAnalysisSchema } from '@/core/entities/DiagnosticSession';
import { VIDEO_PROMPTS } from '@/core/prompts/video';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';

@injectable()
export class GeminiProAdapter implements IVideoDiagnosticAI {
    private model: GenerativeModel;

    constructor(projectId: string) {
        const authOptions = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? { credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) }
            : undefined;

        console.log('DEBUG: GeminiProAdapter authOptions present:', !!authOptions);

        const vertex = new VertexAI({
            project: projectId,
            location: 'us-central1',
            googleAuthOptions: authOptions
        });

        this.model = vertex.getGenerativeModel({
            model: 'gemini-2.0-flash-thinking-exp-1219',
            generationConfig: { responseMimeType: 'application/json' }
        });
    }

    async analyzeMechanicalVideo(videoUrl: string, vehicleContext: string): Promise<AIAnalysis> {
        const prompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
        
        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}
        `;

        const result = await this.model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' } }
                ]
            }]
        });

        const rawText = result.response.candidates?.[0].content.parts[0].text;
        if (!rawText) throw new Error("AI returned empty response");

        return AIAnalysisSchema.parse(JSON.parse(rawText));
    }
}
