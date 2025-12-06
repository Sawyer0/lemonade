import { injectable } from 'inversify';
import { VertexAI } from '@google-cloud/vertexai';
import { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import { AIAnalysis, AIAnalysisSchema } from '@/core/entities/DiagnosticSession';
import { VIDEO_PROMPTS } from '@/core/prompts/video';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { CONFIG } from '@/infrastructure/config';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class GeminiProAdapter implements IVideoDiagnosticAI {
    private client: VertexAI;

    constructor(projectId: string) {
        const authOptions = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? { credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) }
            : undefined;

        console.log('DEBUG: GeminiProAdapter (Legacy SDK) authOptions present:', !!authOptions);

        this.client = new VertexAI({
            project: projectId,
            location: 'us-central1',
            googleAuthOptions: authOptions
        });
    }

    async analyzeMechanicalVideo(videoUrl: string, vehicleContext: string, mimeType: string = 'video/mp4'): Promise<AIAnalysis> {
        console.log("DEBUG: Sending to Vertex AI (Corrected Structure)", { videoUrl, mimeType });

        // Merge system instruction into the user prompt to simplify the request structure
        // and avoid SDK issues with the systemInstruction config object.
        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}

        IMPORTANT: You must return the analysis in VALID JSON format strictly matching this structure:
        {
            "safety_alert": boolean,
            "severity": "low" | "medium" | "high" | "critical",
            "diagnosis": "string",
            "visual_evidence": ["string"],
            "acoustic_evidence": ["string"],
            "suggested_actions": ["string"]
        }
        Do not include markdown code fences (like \`\`\`json). Return raw JSON only.
        `;

        const model = this.client.getGenerativeModel({
            model: CONFIG.AI_MODELS.VIDEO_PRIMARY
        });

        // Construct request exactly as per Vertex AI requirements for GCS
        const request = {
            contents: [{
                role: 'user',
                parts: [
                    {
                        fileData: {
                            mimeType: mimeType,
                            fileUri: videoUrl
                        }
                    },
                    { text: fullPrompt }
                ]
            }]
        };

        try {
            const result = await traceAiCall({
                name: 'video_diagnostic_v2_legacy',
                inputs: { videoUrl, vehicleContext, mimeType },
                exec: async () => model.generateContent(request)
            });

            // The Legacy SDK response structure
            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response");

            // Clean up markdown formatting if present
            let rawText = responseText;
            rawText = rawText.replace(/```json\n?/g, '').replace(/```/g, '').trim();

            // Validate against our Zod schema
            return AIAnalysisSchema.parse(JSON.parse(rawText));

        } catch (error) {
            console.error("Vertex AI Failure:", JSON.stringify(error, null, 2));
            throw error;
        }
    }
}
