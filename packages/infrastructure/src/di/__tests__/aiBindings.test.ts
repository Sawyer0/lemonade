import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import type {
    IChatAssistantAI,
    ILiveStreamAnalyzer,
    IMediaAnalysisModel,
    IMultimodalUploadAnalyzer,
} from '@lemonade/core';
import { TYPES } from '../types';
import { bindAiProviders } from '../aiBindings';
import { CompletionChatAdapter } from '../../ai/llm/CompletionChatAdapter';
import { CompletionMediaModel } from '../../ai/llm/CompletionMediaModel';
import { GeminiChatAdapter } from '../../ai/GeminiChatAdapter';
import { GeminiMediaModel } from '../../ai/gemini/GeminiMediaModel';
import { MediaUploadAnalyzer } from '../../ai/media/MediaUploadAnalyzer';
import { LiveStreamAnalyzer } from '../../ai/media/LiveStreamAnalyzer';

function containerWithSharedServices(): Container {
    const container = new Container();
    const noop = {};
    for (const key of [
        TYPES.BillingService,
        TYPES.ContextCacheService,
        TYPES.TracingService,
        TYPES.UserRepo,
        TYPES.SessionRepo,
        TYPES.FunctionCallService,
    ]) {
        container.bind(key).toConstantValue(noop);
    }
    container.bind(TYPES.Logger).toConstantValue({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() });
    const model = { startChat: vi.fn(), generateContent: vi.fn(), countTokens: vi.fn() };
    container
        .bind(TYPES.GeminiCoreAdapter)
        .toConstantValue({ getGenerativeModel: () => model, commonTools: [], commonSafetySettings: [] });
    return container;
}

describe('bindAiProviders', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('binds Groq models under the provider-neutral analyzers', () => {
        vi.stubEnv('GROQ_API_KEY', 'test-key');
        const container = containerWithSharedServices();
        bindAiProviders(container, 'groq');

        expect(container.get<IChatAssistantAI>(TYPES.ChatAI)).toBeInstanceOf(CompletionChatAdapter);
        expect(container.get<IMediaAnalysisModel>(TYPES.MediaAnalysisModel)).toBeInstanceOf(CompletionMediaModel);
        expect(container.get<IMultimodalUploadAnalyzer>(TYPES.MultimodalUploadAI)).toBeInstanceOf(MediaUploadAnalyzer);
        expect(container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI)).toBeInstanceOf(LiveStreamAnalyzer);
    });

    it('binds Vertex Gemini by default', () => {
        const container = containerWithSharedServices();
        bindAiProviders(container, 'vertex');

        expect(container.get<IChatAssistantAI>(TYPES.ChatAI)).toBeInstanceOf(GeminiChatAdapter);
        const media = container.get<IMediaAnalysisModel>(TYPES.MediaAnalysisModel);
        expect(media).toBeInstanceOf(GeminiMediaModel);
        expect(media.modelId).toBe('gemini-2.5-flash');
        expect(container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI)).toBeInstanceOf(LiveStreamAnalyzer);
    });
});
