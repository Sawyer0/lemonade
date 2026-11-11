import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { llm, stt, tts } from '@livekit/agents';
import { initializeLogger } from '@livekit/agents';
import { Behavior, Modality } from '@google/genai';
import {
    CARTESIA_TTS_MODEL,
    DEEPGRAM_STT_MODEL,
    GEMINI_FLASH_MODEL,
    GEMINI_LIVE_MODEL,
    GEMINI_VOICE,
    GROK_VOICE,
    GROK_VOICE_MODEL,
    type ICaseRepository,
    type LedgerEntry,
    type AppendLedgerEntryInput,
} from '@lemonade/core';
import { loadEnv } from '../src/env';
import {
    createVoiceProvider,
    parseVoiceProviderId,
    type VoicePlugins,
    type VoiceProviderId,
} from '../src/voice/provider';
import {
    CONTEXT_COMPRESSION_TARGET_TOKENS,
    CONTEXT_COMPRESSION_TRIGGER_TOKENS,
    livekitPlugins,
} from '../src/voice/livekitPlugins';
import { createTranscriptSink } from '../src/voice/transcriptLedger';
import { fakeLogger } from './fakes';
import transcriptTurns from './fixtures/transcripts.json';

const CASE_ID = '123e4567-e89b-12d3-a456-426614174000';

function fakePlugins() {
    const realtimeModel = { fake: 'realtime-model' } as unknown as llm.RealtimeModel;
    const chatModel = { fake: 'chat-model' } as unknown as llm.LLM;
    const sttModel = { fake: 'stt' } as unknown as stt.STT;
    const ttsModel = { fake: 'tts' } as unknown as tts.TTS;
    const plugins: VoicePlugins = {
        geminiRealtime: vi.fn(() => realtimeModel),
        grokRealtime: vi.fn(() => realtimeModel),
        deepgramStt: vi.fn(() => sttModel),
        geminiChat: vi.fn(() => chatModel),
        cartesiaTts: vi.fn(() => ttsModel),
    };
    return { plugins, realtimeModel, chatModel, sttModel, ttsModel };
}

function fakeRepo() {
    const appendEntry = vi.fn((_caseId: string, _input: AppendLedgerEntryInput) =>
        Promise.resolve({} as unknown as LedgerEntry),
    );
    return { appendEntry, repo: { appendEntry } as unknown as ICaseRepository };
}

describe('parseVoiceProviderId', () => {
    it('defaults to gemini', () => {
        expect(parseVoiceProviderId(undefined)).toBe('gemini');
    });

    it('accepts each provider id', () => {
        expect(parseVoiceProviderId('gemini')).toBe('gemini');
        expect(parseVoiceProviderId('grok')).toBe('grok');
        expect(parseVoiceProviderId('cascade')).toBe('cascade');
    });

    it('rejects unknown providers instead of silently falling back', () => {
        expect(() => parseVoiceProviderId('resemble')).toThrow('Unknown VOICE_PROVIDER "resemble"');
        expect(() => loadEnv({ VOICE_PROVIDER: 'resemble' })).toThrow('Unknown VOICE_PROVIDER "resemble"');
    });

    it('defaults VOICE_PROVIDER to gemini in loadEnv', () => {
        expect(loadEnv({ GOOGLE_API_KEY: 'g' }).VOICE_PROVIDER).toBe('gemini');
    });
});

/**
 * Contract suite: the same cases run against every provider, so swapping
 * providers through VOICE_PROVIDER cannot silently change what the agent
 * loop gets. Fake vendor builders keep the suite offline.
 */
const CONTRACT: Array<{
    id: VoiceProviderId;
    keys: Record<string, string>;
    videoInput: 'native' | 'snapshot';
}> = [
    { id: 'gemini', keys: { GOOGLE_API_KEY: 'g-key' }, videoInput: 'native' },
    { id: 'grok', keys: { XAI_API_KEY: 'x-key' }, videoInput: 'snapshot' },
    {
        id: 'cascade',
        keys: { GOOGLE_API_KEY: 'g-key', DEEPGRAM_API_KEY: 'd-key', CARTESIA_API_KEY: 'c-key' },
        videoInput: 'snapshot',
    },
];

describe.each(CONTRACT)('voice provider contract: $id', ({ id, keys, videoInput }) => {
    it('builds session parts for the provider id with the right video mode', () => {
        const { plugins, realtimeModel, chatModel, sttModel, ttsModel } = fakePlugins();
        const provider = createVoiceProvider(loadEnv({ VOICE_PROVIDER: id, ...keys }), plugins);

        expect(provider.id).toBe(id);
        expect(provider.videoInput).toBe(videoInput);
        if (id === 'cascade') {
            expect(provider.sessionParts()).toEqual({ stt: sttModel, llm: chatModel, tts: ttsModel });
        } else {
            expect(provider.sessionParts()).toEqual({ llm: realtimeModel });
        }
    });

    it('passes model ids from models.ts and keys from env to the vendor builders', () => {
        const { plugins } = fakePlugins();
        const provider = createVoiceProvider(loadEnv({ VOICE_PROVIDER: id, ...keys }), plugins);
        provider.sessionParts();

        if (id === 'gemini') {
            expect(plugins.geminiRealtime).toHaveBeenCalledWith({
                model: GEMINI_LIVE_MODEL,
                apiKey: 'g-key',
                voice: GEMINI_VOICE,
                temperature: 0.7,
            });
            expect(plugins.grokRealtime).not.toHaveBeenCalled();
            expect(plugins.deepgramStt).not.toHaveBeenCalled();
        } else if (id === 'grok') {
            expect(plugins.grokRealtime).toHaveBeenCalledWith({
                model: GROK_VOICE_MODEL,
                apiKey: 'x-key',
                voice: GROK_VOICE,
            });
            expect(plugins.geminiRealtime).not.toHaveBeenCalled();
            expect(plugins.deepgramStt).not.toHaveBeenCalled();
        } else {
            expect(plugins.deepgramStt).toHaveBeenCalledWith({ model: DEEPGRAM_STT_MODEL, apiKey: 'd-key' });
            expect(plugins.geminiChat).toHaveBeenCalledWith({
                model: GEMINI_FLASH_MODEL,
                apiKey: 'g-key',
                temperature: 0.7,
            });
            expect(plugins.cartesiaTts).toHaveBeenCalledWith({
                model: CARTESIA_TTS_MODEL,
                apiKey: 'c-key',
                voice: undefined,
            });
            expect(plugins.geminiRealtime).not.toHaveBeenCalled();
            expect(plugins.grokRealtime).not.toHaveBeenCalled();
        }
    });

    it('records every fixture turn in the ledger with its provider id', async () => {
        const { appendEntry, repo } = fakeRepo();
        const sink = createTranscriptSink({
            caseId: CASE_ID,
            userId: 'user-1',
            provider: id,
            repository: () => repo,
            logger: fakeLogger(),
        });

        for (const turn of transcriptTurns) {
            await sink.record(turn.role as 'user' | 'assistant', turn.text);
        }

        expect(appendEntry).toHaveBeenCalledTimes(transcriptTurns.length);
        transcriptTurns.forEach((turn, index) => {
            expect(appendEntry).toHaveBeenNthCalledWith(
                index + 1,
                CASE_ID,
                expect.objectContaining({
                    type: 'transcript',
                    payload: { role: turn.role, text: turn.text, provider: id },
                }),
            );
        });
        const userCall = appendEntry.mock.calls[0][1];
        expect(userCall.actor).toEqual({ kind: 'user', id: 'user-1' });
        expect(userCall.source).toBe('tech');
        const agentCall = appendEntry.mock.calls[1][1];
        expect(agentCall.actor).toEqual({ kind: 'agent', id: 'master-tech' });
        expect(agentCall.source).toBe('model');
    });
});

describe('voice provider keys', () => {
    /** Every key each provider needs, so loadEnv passes and the sessionParts check is the one under test. */
    const ALL_KEYS: Record<VoiceProviderId, Record<string, string>> = {
        gemini: { GOOGLE_API_KEY: 'g' },
        grok: { XAI_API_KEY: 'x' },
        cascade: { GOOGLE_API_KEY: 'g', DEEPGRAM_API_KEY: 'd', CARTESIA_API_KEY: 'c' },
    };

    it.each([
        ['gemini', 'GOOGLE_API_KEY'],
        ['grok', 'XAI_API_KEY'],
        ['cascade', 'CARTESIA_API_KEY'],
        ['cascade', 'DEEPGRAM_API_KEY'],
        ['cascade', 'GOOGLE_API_KEY'],
    ] as Array<[VoiceProviderId, 'GOOGLE_API_KEY' | 'XAI_API_KEY' | 'DEEPGRAM_API_KEY' | 'CARTESIA_API_KEY']>)(
        'fails fast in sessionParts when %s is missing %s',
        (id, missing) => {
            const { plugins } = fakePlugins();
            // loadEnv fails fast at startup too; blank the key after it
            // passes so this still covers the sessionParts check itself.
            const env = loadEnv({ VOICE_PROVIDER: id, ...ALL_KEYS[id] });
            env[missing] = undefined;
            const provider = createVoiceProvider(env, plugins);
            expect(() => provider.sessionParts()).toThrow(`${missing} must be set`);
        },
    );
});

describe('transcript sink', () => {
    it('records nothing without a case id and never resolves the repository', async () => {
        const repository = vi.fn(() => undefined);
        const sink = createTranscriptSink({
            caseId: undefined,
            userId: 'user-1',
            provider: 'gemini',
            repository,
            logger: fakeLogger(),
        });
        await sink.record('user', 'hello');
        expect(repository).not.toHaveBeenCalled();
    });

    it('warns once and keeps the session running when the ledger is unavailable', async () => {
        const logger = fakeLogger();
        const sink = createTranscriptSink({
            caseId: CASE_ID,
            userId: 'user-1',
            provider: 'grok',
            repository: () => {
                throw new Error('LEMONADE_CASE_LEDGER_DATABASE_URL is not set');
            },
            logger,
        });
        await expect(sink.record('assistant', 'hello')).resolves.toBeUndefined();
        await sink.record('assistant', 'again');
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs a failed append instead of throwing into the live session', async () => {
        const logger = fakeLogger();
        const appendEntry = vi.fn(async () => {
            throw new Error('database down');
        });
        const sink = createTranscriptSink({
            caseId: CASE_ID,
            userId: 'user-1',
            provider: 'cascade',
            repository: () => ({ appendEntry }) as unknown as ICaseRepository,
            logger,
        });
        await expect(sink.record('user', 'hello')).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

/** The plugin's RealtimeModel keeps its resolved options on `_options`. */
interface RealtimeModelInternals {
    label(): string;
    _options: {
        model: string;
        vertexai: boolean;
        // The constructor stores the requested modalities as responseModalities.
        responseModalities: unknown[];
        // LM-13: non-blocking tool calls are set explicitly, never left to the default.
        toolBehavior?: Behavior;
        contextWindowCompression?: { triggerTokens?: string; slidingWindow?: { targetTokens?: string } };
    };
}

describe('livekit plugins', () => {
    // The real models log at construction, and the LiveKit logger lives on
    // global state: the worker CLI initialises it at startup, so a test that
    // builds a real model has to do the same.
    beforeAll(() => {
        initializeLogger({ pretty: false, level: 'info' });
    });

    it('builds a 3.8 Live realtime model on the Developer API with compression', () => {
        const built = livekitPlugins.geminiRealtime({
            model: GEMINI_LIVE_MODEL,
            apiKey: 'g-key',
            voice: GEMINI_VOICE,
            temperature: 0.7,
        }) as unknown as RealtimeModelInternals;

        expect(built._options.model).toBe(GEMINI_LIVE_MODEL);
        expect(built._options.vertexai).toBe(false);
        expect(built._options.responseModalities).toEqual([Modality.AUDIO]);
        expect(built._options.toolBehavior).toBe(Behavior.NON_BLOCKING);
        expect(built._options.contextWindowCompression).toEqual({
            triggerTokens: CONTEXT_COMPRESSION_TRIGGER_TOKENS,
            slidingWindow: { targetTokens: CONTEXT_COMPRESSION_TARGET_TOKENS },
        });
    });

    it('builds a Grok Voice realtime model on the xAI API', () => {
        const built = livekitPlugins.grokRealtime({
            model: GROK_VOICE_MODEL,
            apiKey: 'x-key',
            voice: GROK_VOICE,
        }) as unknown as RealtimeModelInternals;

        expect(built.label()).toBe('xai.RealtimeModel');
        expect(built._options.model).toBe(GROK_VOICE_MODEL);
    });

    it('builds the cascade pipeline pieces from the configured models', () => {
        const sttModel = livekitPlugins.deepgramStt({ model: DEEPGRAM_STT_MODEL, apiKey: 'd-key' });
        const chatModel = livekitPlugins.geminiChat({ model: GEMINI_FLASH_MODEL, apiKey: 'g-key', temperature: 0.7 });
        const ttsModel = livekitPlugins.cartesiaTts({ model: CARTESIA_TTS_MODEL, apiKey: 'c-key' });

        expect(sttModel.model).toBe(DEEPGRAM_STT_MODEL);
        expect(chatModel.model).toBe(GEMINI_FLASH_MODEL);
        expect(ttsModel.model).toBe(CARTESIA_TTS_MODEL);
    });
});
