import { injectable } from 'inversify';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import { VIDEO_ANALYSIS_RAW_SCHEMA } from '@/core/types/video';
import { AIAnalysis, AIAnalysisSchema } from '@/core/entities/DiagnosticSession';
import { VIDEO_PROMPTS } from '@/core/prompts/video';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { CONFIG } from '@/infrastructure/config';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

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
            model: CONFIG.AI_MODELS.PRIMARY,
            generationConfig: {
                responseMimeType: 'application/json',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseSchema: VIDEO_ANALYSIS_RAW_SCHEMA as any
            }
        });
    }

    async analyzeMechanicalVideo(videoUrl: string, vehicleContext: string, mimeType: string = 'video/mp4'): Promise<AIAnalysis> {
        const prompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}
        
        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}
        `;

        const result = await traceAiCall({
            name: 'video_diagnostic',
            inputs: {
                videoUrl,
                vehicleContext,
                mimeType
            },
            exec: () => this.model.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { fileData: { fileUri: videoUrl, mimeType: mimeType } }
                    ]
                }]
            }),
        });

        const candidate = result.response.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text;
        if (!rawText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response");
        return AIAnalysisSchema.parse(JSON.parse(rawText));
    }
}
