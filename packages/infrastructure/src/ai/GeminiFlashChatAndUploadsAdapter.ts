import { injectable, inject } from 'inversify';
import type { GenerativeModel, Part } from '@google-cloud/vertexai';
import type {
    IChatAssistantAI,
    IMultimodalUploadAnalyzer,
    AIAnalysis,
    ILogger,
    IBillingService,
    IContextCacheService,
    ReasoningEffort,
    VerificationRequest,
    VerificationResponse,
    MessagePart,
    StreamingEvent,
} from '@lemonade/core';
import { CONFIG } from '../config';
import { TracingService } from '../observability/TracingService';
import { TYPES } from '../di/types';
import { FunctionCallService } from './FunctionCallHandler';
import { GeminiCoreAdapter } from './GeminiCoreAdapter';
import { GeminiChatResponder } from './gemini/GeminiChatResponder';
import { GeminiHypothesisVerifier } from './gemini/GeminiHypothesisVerifier';
import { GeminiUploadAnalyzer } from './gemini/GeminiUploadAnalyzer';
import { type ChatHistoryMessage, toCountableParts } from './gemini/chatContent';

/**
 * Vertex Gemini Flash behind the chat and upload ports. One model instance is
 * shared by three focused collaborators: the chat responder, the hypothesis
 * verifier and the upload analyzer. This class only adapts the port signatures.
 */
@injectable()
export class GeminiFlashChatAndUploadsAdapter implements IChatAssistantAI, IMultimodalUploadAnalyzer {
    private readonly model: GenerativeModel;
    private readonly chat: GeminiChatResponder;
    private readonly verifier: GeminiHypothesisVerifier;
    private readonly uploads: GeminiUploadAnalyzer;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) billingService: IBillingService,
        @inject(TYPES.GeminiCoreAdapter) coreAdapter: GeminiCoreAdapter,
        @inject(TYPES.FunctionCallService) functionCallService: FunctionCallService,
        @inject(TYPES.ContextCacheService) cacheService: IContextCacheService,
        @inject(TYPES.TracingService) tracer: TracingService,
    ) {
        this.model = coreAdapter.getGenerativeModel(
            CONFIG.AI_MODELS.CHAT_MODEL,
            coreAdapter.commonTools,
            coreAdapter.commonSafetySettings,
        );
        this.chat = new GeminiChatResponder(
            this.model,
            billingService,
            functionCallService,
            cacheService,
            tracer,
            logger,
        );
        this.verifier = new GeminiHypothesisVerifier(this.model, cacheService, logger);
        this.uploads = new GeminiUploadAnalyzer(this.model, billingService, cacheService, tracer, logger);
        this.logger.info(`GeminiFlashChatAndUploadsAdapter initialized, using model: ${CONFIG.AI_MODELS.CHAT_MODEL}`);
    }

    verifyHypothesis(request: VerificationRequest, traceId?: string): Promise<VerificationResponse> {
        return this.verifier.verify(request, traceId);
    }

    analyzeUploadedVideo(
        videoUrl: string,
        vehicleContext: string,
        mimeType: string = 'video/mp4',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
        videoDurationMinutes?: number,
    ): Promise<AIAnalysis> {
        return this.uploads.analyze({
            kind: 'video',
            fileUrl: videoUrl,
            vehicleContext,
            mimeType,
            userId,
            sessionId,
            reasoningEffort,
            videoDurationMinutes,
        });
    }

    analyzeUploadedImage(
        imageUrl: string,
        vehicleContext: string,
        mimeType: string = 'image/jpeg',
        userId?: string,
        sessionId?: string,
        reasoningEffort?: ReasoningEffort,
    ): Promise<AIAnalysis> {
        return this.uploads.analyze({
            kind: 'image',
            fileUrl: imageUrl,
            vehicleContext,
            mimeType,
            userId,
            sessionId,
            reasoningEffort,
        });
    }

    generateReplyStream(
        history: ChatHistoryMessage[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        vin?: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: Part[],
        traceId?: string,
    ): AsyncGenerator<StreamingEvent, void, unknown> {
        return this.chat.stream({
            history,
            message,
            vehicleContext,
            diagnosticContext,
            userId,
            sessionId,
            vin,
            reasoningEffort,
            additionalParts,
            traceId,
        });
    }

    generateReply(
        history: ChatHistoryMessage[],
        message: string,
        vehicleContext: string,
        diagnosticContext: AIAnalysis | null,
        userId: string,
        sessionId: string,
        vin?: string,
        reasoningEffort?: ReasoningEffort,
        additionalParts?: Part[],
        traceId?: string,
    ): Promise<string | MessagePart[]> {
        return this.chat.reply({
            history,
            message,
            vehicleContext,
            diagnosticContext,
            userId,
            sessionId,
            vin,
            reasoningEffort,
            additionalParts,
            traceId,
        });
    }

    async countTokens(content: string | MessagePart[] | Part[]): Promise<number> {
        const parts = toCountableParts(content);
        if (parts.length === 0) return 0;

        try {
            const result = await this.model.countTokens({ contents: [{ role: 'user', parts }] });
            return result.totalTokens;
        } catch (error) {
            this.logger.error('countTokens failed', error);
            return 0;
        }
    }
}
