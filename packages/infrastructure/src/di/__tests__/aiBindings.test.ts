import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Container } from 'inversify';
import type {
    IChatAssistantAI,
    ILiveStreamAnalyzer,
    IMediaAnalysisModel,
    IMultimodalUploadAnalyzer,
    ISafetyAI,
} from '@lemonade/core';
import { TYPES } from '../types';
import { bindAiProviders } from '../aiBindings';
import { CompletionChatAdapter } from '../../ai/llm/CompletionChatAdapter';
import { CompletionSafetyAdapter } from '../../ai/llm/CompletionSafetyAdapter';
import { OFFLINE_ANALYSIS, OFFLINE_CHAT_REPLY } from '../../ai/llm/offlineDemo';
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
        TYPES.ResponseCache,
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

    it('binds canned offline models that need no key or network', async () => {
        const container = containerWithSharedServices();
        bindAiProviders(container, 'offline');

        const chat = container.get<IChatAssistantAI>(TYPES.ChatAI);
        expect(chat).toBeInstanceOf(CompletionChatAdapter);
        expect(await chat.generateReply([], 'squeal', 'Civic', null, 'u', 's')).toBe(OFFLINE_CHAT_REPLY);
        expect(container.get<ISafetyAI>(TYPES.SafetyAI)).toBeInstanceOf(CompletionSafetyAdapter);
        const media = container.get<IMediaAnalysisModel>(TYPES.MediaAnalysisModel);
        expect(media.modelId).toBe('offline-demo');
        const reply = await media.analyze({
            prompt: 'p',
            media: { kind: 'image', mimeType: 'image/jpeg', uri: 'https://x/p.jpg' },
            structured: true,
        });
        expect(JSON.parse(reply.text ?? '')).toEqual(OFFLINE_ANALYSIS);
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
