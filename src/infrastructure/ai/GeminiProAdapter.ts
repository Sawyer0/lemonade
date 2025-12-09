import { injectable, inject } from 'inversify';
import { VertexAI, SchemaType } from '@google-cloud/vertexai';
import { IVideoDiagnosticAI } from '@/core/interfaces/IAIService';
import { AIAnalysis, AIAnalysisSchema } from '@/core/entities/DiagnosticSession';
import { VIDEO_PROMPTS } from '@/core/prompts/video';
import { SYSTEM_PROMPTS } from '@/core/prompts/system';
import { CONFIG } from '@/infrastructure/config';
import { traceAiCall } from '@/infrastructure/observability/langsmithTracer';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import type { ILogger } from '@/core/interfaces/ILogger';
import type { IBillingService } from '@/core/interfaces/IBillingService';
import { TYPES } from '@/infrastructure/di/types';
import { ReasoningEffort, AI_GENERATION_CONFIGS, AiGenerationConfig } from '@/core/types/ai';

@injectable()
export class GeminiProAdapter implements IVideoDiagnosticAI {
    private client: VertexAI;

    constructor(
        projectId: string,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService
    ) {
        const authOptions = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? { credentials: JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) }
            : undefined;

        this.logger.debug('GeminiProAdapter initialized', { authPresent: !!authOptions });

        this.client = new VertexAI({
            project: projectId,
            location: 'us-central1',
            googleAuthOptions: authOptions
        });
    }

    private getGenerationConfigForVideo(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === "none") return AI_GENERATION_CONFIGS.LIVE_VIDEO;
        // Default to none for video to ensure max speed
        return AI_GENERATION_CONFIGS.LIVE_VIDEO;
    }

    private getGenerationConfigForManual(effort?: ReasoningEffort): AiGenerationConfig {
        if (!effort || effort === "high") return AI_GENERATION_CONFIGS.MANUAL_READER;
        if (effort === "moderate") return AI_GENERATION_CONFIGS.MANUAL_MODERATE;
        // Fallback for low/none to moderate for manuals as they require some thinking, or standard manual reader
        return AI_GENERATION_CONFIGS.MANUAL_READER;
    }

    async analyzeMechanicalVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort
    ): Promise<AIAnalysis> {
        this.logger.debug("Sending to Vertex AI (Structured Output)", { videoUrl, mimeType });

        // Merge system instruction into the user prompt
        const fullPrompt = `
        ${SYSTEM_PROMPTS.IDENTITY}
        ${SYSTEM_PROMPTS.PRIME_DIRECTIVES}

        ${VIDEO_PROMPTS.ANALYSIS(vehicleContext)}
        `;

        const genConfig = this.getGenerationConfigForVideo(reasoningEffort);

        const model = this.client.getGenerativeModel({
            model: CONFIG.AI_MODELS.TEXT_INTERFACE,
            generationConfig: {
                responseMimeType: genConfig.responseMimeType,
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        safety_alert: { type: SchemaType.BOOLEAN },
                        severity: { type: SchemaType.STRING, enum: ['low', 'medium', 'high', 'critical'] },
                        diagnosis: { type: SchemaType.STRING },
                        visual_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        acoustic_evidence: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                        suggested_actions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                    },
                    required: ['safety_alert', 'severity', 'diagnosis', 'visual_evidence', 'acoustic_evidence', 'suggested_actions']
                }
            } as any
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
                name: 'video_diagnostic_v2_structured',
                inputs: { videoUrl, vehicleContext, mimeType },
                exec: async () => model.generateContent(request)
            });

            // Billing Ledger Optimization: Record Usage
            if (result.response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.TEXT_INTERFACE,
                    timestamp: new Date()
                });
            }


            // Extract text from Vertex AI response candidate
            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response");

            // No regex cleanup needed for Native Structured Output
            return AIAnalysisSchema.parse(JSON.parse(responseText));

        } catch (error) {
            this.logger.error("Vertex AI Failure", error);
            throw error;
        }
    }
    async analyzeManual(
        manualUri: string,
        query: string,
        cacheName?: string,
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort // Added
    ): Promise<string> {
        this.logger.debug("Analyzing Manual with Brain", { manualUri, cacheName });

        const genConfig = this.getGenerationConfigForManual(reasoningEffort);

        // Use the "Brain" model for heavy reasoning over manuals
        const model = this.client.getGenerativeModel({
            model: CONFIG.AI_MODELS.AGENT.BRAIN,
            // If cacheName is provided, we bind the model to this cache context
            // SDK types expect CachedContent object, but often just the name or simple ref works at runtime
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cachedContent: cacheName ? ({ name: cacheName } as any) : undefined,
            generationConfig: {
                thinkingConfig: genConfig.thinkingConfig,
                temperature: genConfig.temperature,
                responseMimeType: genConfig.responseMimeType,
            } as any,
        });

        const prompt = SYSTEM_PROMPTS.MANUAL_ANALYSIS_INSTRUCTION(query);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const request: any = {
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }]
        };

        // If NO cache is used (falback), we must provide the file content directly
        if (!cacheName) {
            request.contents[0].parts.unshift({
                fileData: {
                    mimeType: 'application/pdf',
                    fileUri: manualUri
                }
            });
        }

        try {
            const result = await traceAiCall({
                name: 'manual_analysis_brain',
                inputs: { manualUri, query, cacheName },
                exec: async () => model.generateContent(request)
            });

            // Billing Ledger Optimization: Record Usage
            if (result.response.usageMetadata && userId && sessionId) {
                await this.billingService.recordUsage({
                    userId: userId,
                    sessionId: sessionId,
                    inputTokens: result.response.usageMetadata.promptTokenCount || 0,
                    outputTokens: result.response.usageMetadata.candidatesTokenCount || 0,
                    model: CONFIG.AI_MODELS.AGENT.BRAIN,
                    timestamp: new Date()
                });
            }

            const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!responseText) throw new AppError(ErrorCode.AI_SERVICE_ERROR, "AI returned empty response for manual analysis");

            return responseText;
        } catch (error) {
            this.logger.error("Vertex AI Brain Failure", error);
            throw error;
        }
    }
}