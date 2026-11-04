import type { Container } from 'inversify';
import type {
    IChatAssistantAI,
    ILiveStreamAnalyzer,
    ILogger,
    IMediaAnalysisModel,
    IMultimodalUploadAnalyzer,
    ISafetyAI,
} from '@lemonade/core';
import { SHARED_CONFIG } from '@lemonade/core';
import { TYPES } from './types';
import { GeminiChatAdapter } from '../ai/GeminiChatAdapter';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';
import { FunctionCallService } from '../ai/FunctionCallHandler';
import { VertexAISafetyAdapter } from '../ai/VertexAISafetyAdapter';
import { GeminiMediaModel } from '../ai/gemini/GeminiMediaModel';
import { MediaUploadAnalyzer } from '../ai/media/MediaUploadAnalyzer';
import { LiveStreamAnalyzer } from '../ai/media/LiveStreamAnalyzer';
import { CompletionChatAdapter } from '../ai/llm/CompletionChatAdapter';
import { CompletionSafetyAdapter } from '../ai/llm/CompletionSafetyAdapter';
import { CompletionMediaModel } from '../ai/llm/CompletionMediaModel';
import { type LlmProvider, createGroqClient, createGroqVisionClient, resolveLlmProvider } from '../ai/llm/groq';
import { createOfflineChatClient, createOfflineMediaClient, createOfflineSafetyClient } from '../ai/llm/offlineDemo';

/**
 * Binds the model ports (chat, System 1 safety, media) to one provider and the
 * provider-neutral upload and live analyzers on top of them. Vertex AI is the
 * default; LLM_PROVIDER=groq uses Groq's OpenAI-compatible API (GROQ_API_KEY), and
 * LLM_PROVIDER=offline uses canned replies so the app runs with no key or network.
 * The container must already bind Logger, Billing, cache, tracing, the user and
 * session repositories and, for Vertex, GeminiCoreAdapter and FunctionCallService.
 */
export function bindAiProviders(container: Container, provider: LlmProvider = resolveLlmProvider()): void {
    if (provider === 'offline') {
        container
            .bind<IChatAssistantAI>(TYPES.ChatAI)
            .toDynamicValue(() => new CompletionChatAdapter(createOfflineChatClient()))
            .inSingletonScope();
        container
            .bind<ISafetyAI>(TYPES.SafetyAI)
            .toDynamicValue(() => new CompletionSafetyAdapter(createOfflineSafetyClient()))
            .inSingletonScope();
        container
            .bind<IMediaAnalysisModel>(TYPES.MediaAnalysisModel)
            .toDynamicValue(() => new CompletionMediaModel(createOfflineMediaClient()))
            .inSingletonScope();
    } else if (provider === 'groq') {
        container
            .bind<IChatAssistantAI>(TYPES.ChatAI)
            .toDynamicValue(() => new CompletionChatAdapter(createGroqClient()))
            .inSingletonScope();
        container
            .bind<ISafetyAI>(TYPES.SafetyAI)
            .toDynamicValue(() => new CompletionSafetyAdapter(createGroqClient()))
            .inSingletonScope();
        container
            .bind<IMediaAnalysisModel>(TYPES.MediaAnalysisModel)
            .toDynamicValue(() => new CompletionMediaModel(createGroqVisionClient()))
            .inSingletonScope();
    } else {
        container.bind<IChatAssistantAI>(TYPES.ChatAI).to(GeminiChatAdapter).inSingletonScope();
        container.bind<ISafetyAI>(TYPES.SafetyAI).to(VertexAISafetyAdapter).inSingletonScope();
        container
            .bind<IMediaAnalysisModel>(TYPES.MediaAnalysisModel)
            .toDynamicValue(
                (context) =>
                    new GeminiMediaModel(
                        context.get<GeminiCoreAdapter>(TYPES.GeminiCoreAdapter),
                        SHARED_CONFIG.AI_MODELS.CHAT_MODEL,
                        context.get<FunctionCallService>(TYPES.FunctionCallService),
                        context.get<ILogger>(TYPES.Logger),
                    ),
            )
            .inSingletonScope();
    }

    container.bind<IMultimodalUploadAnalyzer>(TYPES.MultimodalUploadAI).to(MediaUploadAnalyzer).inSingletonScope();
    container.bind<ILiveStreamAnalyzer>(TYPES.LiveStreamAI).to(LiveStreamAnalyzer).inSingletonScope();
}
