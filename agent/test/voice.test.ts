import { describe, it, expect, vi } from 'vitest';
import type { llm, tts } from '@livekit/agents';
import { GEMINI_LIVE_MODEL, createVoice, selectVoiceKind } from '../src/voice/voice';
import { RoomPublisher } from '../src/channel/roomPublisher';
import { LiveChannelTopic } from '@lemonade/core';
import { loadEnv } from '../src/env';

function fakeProviders() {
    const model = { fake: 'realtime-model' } as unknown as llm.RealtimeModel;
    const speech = { fake: 'resemble' } as unknown as tts.TTS;
    return { model, speech, providers: { realtimeModel: vi.fn(() => model), resembleTts: vi.fn(() => speech) } };
}

describe('voice port', () => {
    it('defaults to gemini native audio with no separate tts', () => {
        const { model, providers } = fakeProviders();
        const voice = createVoice(loadEnv({ GOOGLE_API_KEY: 'g-key' }), providers);

        expect(voice).toEqual({ kind: 'gemini-native-audio', model });
        expect(providers.realtimeModel).toHaveBeenCalledWith(
            expect.objectContaining({ apiKey: 'g-key', reply: 'audio', model: GEMINI_LIVE_MODEL }),
        );
        expect(providers.resembleTts).not.toHaveBeenCalled();
    });

    it('uses resemble to speak gemini text replies when a resemble key is set', () => {
        const { speech, providers } = fakeProviders();
        expect(selectVoiceKind({ RESEMBLE_API_KEY: 'r' })).toBe('resemble');

        const voice = createVoice(
            loadEnv({ GOOGLE_API_KEY: 'g', RESEMBLE_API_KEY: 'r', RESEMBLE_VOICE_UUID: 'v' }),
            providers,
        );
        expect(voice.kind).toBe('resemble');
        expect(voice.tts).toBe(speech);
        expect(providers.realtimeModel).toHaveBeenCalledWith(expect.objectContaining({ reply: 'text' }));
        expect(providers.resembleTts).toHaveBeenCalledWith({ apiKey: 'r', voiceUuid: 'v' });
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
