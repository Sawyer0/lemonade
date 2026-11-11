import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { llm } from '@livekit/agents';
import { initializeLogger } from '@livekit/agents';
import { Modality } from '@google/genai';
import { GEMINI_LIVE_MODEL, LiveChannelTopic } from '@lemonade/core';
import { GEMINI_VOICE, createVoice } from '../src/voice/voice';
import { livekitVoiceProviders } from '../src/voice/livekitVoiceProviders';
import { RoomPublisher } from '../src/channel/roomPublisher';
import { loadEnv } from '../src/env';

function fakeProviders() {
    const model = { fake: 'realtime-model' } as unknown as llm.RealtimeModel;
    return { model, providers: { realtimeModel: vi.fn(() => model) } };
}

describe('voice port', () => {
    it('uses gemini native audio with no separate tts', () => {
        const { model, providers } = fakeProviders();
        const voice = createVoice(loadEnv({ GOOGLE_API_KEY: 'g-key' }), providers);

        expect(voice).toEqual({ kind: 'gemini-native-audio', model });
        expect(providers.realtimeModel).toHaveBeenCalledWith({
            apiKey: 'g-key',
            model: GEMINI_LIVE_MODEL,
            voice: GEMINI_VOICE,
            temperature: 0.7,
        });
    });

    it('ignores a resemble key: there is no text-reply mode anymore', () => {
        const { model, providers } = fakeProviders();
        const voice = createVoice(loadEnv({ GOOGLE_API_KEY: 'g', RESEMBLE_API_KEY: 'r' }), providers);

        expect(voice).toEqual({ kind: 'gemini-native-audio', model });
        expect(providers.realtimeModel).toHaveBeenCalledWith(
            expect.objectContaining({ model: GEMINI_LIVE_MODEL }),
        );
    });
});

/** The plugin's RealtimeModel keeps its resolved options on `_options`. */
interface RealtimeModelInternals {
    _options: {
        model: string;
        vertexai: boolean;
        // The constructor stores the requested modalities as responseModalities.
        responseModalities: unknown[];
        contextWindowCompression?: { triggerTokens?: string; slidingWindow?: { targetTokens?: string } };
    };
}

describe('livekit voice providers', () => {
    // The real RealtimeModel logs at construction, and the LiveKit logger
    // lives on global state: the worker CLI initialises it at startup, so a
    // test that builds a real model has to do the same.
    beforeAll(() => {
        initializeLogger({ pretty: false, level: 'info' });
    });

    it('builds a 3.8 Live realtime model on the Developer API with compression', () => {
        const built = livekitVoiceProviders.realtimeModel({
            model: GEMINI_LIVE_MODEL,
            apiKey: 'g-key',
            voice: GEMINI_VOICE,
            temperature: 0.7,
        }) as unknown as RealtimeModelInternals;

        expect(built._options.model).toBe(GEMINI_LIVE_MODEL);
        expect(built._options.vertexai).toBe(false);
        expect(built._options.responseModalities).toEqual([Modality.AUDIO]);
        expect(built._options.contextWindowCompression).toEqual({
            triggerTokens: '64000',
            slidingWindow: { targetTokens: '32000' },
        });
    });
});

describe('RoomPublisher', () => {
    it('publishes typed packets on their topics', async () => {
        const publishData = vi.fn().mockResolvedValue(undefined);
        const publisher = new RoomPublisher(() => ({ publishData }));

        await publisher.transcript('Check the belt.');
        await publisher.requestVisualBurst('belt', 'looks glazed');

        const [transcript, transcriptOptions] = publishData.mock.calls[0];
        expect(JSON.parse(new TextDecoder().decode(transcript))).toEqual({
            type: 'chat',
            analysis: { diagnosis: 'Check the belt.' },
        });
        expect(transcriptOptions).toEqual({ reliable: true, topic: LiveChannelTopic.AiResponse });
        expect(publishData.mock.calls[1][1].topic).toBe(LiveChannelTopic.VisualBurstRequest);
    });

    it('does nothing before the agent has joined', async () => {
        await expect(new RoomPublisher(() => undefined).transcript('x')).resolves.toBeUndefined();
    });
});
