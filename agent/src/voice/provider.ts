import type { llm, stt, tts } from '@livekit/agents';
import type { AgentEnv } from '../env';
import { createCascadeProvider } from './providers/cascade';
import { createGeminiProvider } from './providers/gemini';
import { createGrokProvider } from './providers/grok';

/**
 * Voice provider ids, selected by VOICE_PROVIDER. Defaults to gemini.
 * Add a provider here, in `createVoiceProvider`, and in models.ts — the
 * agent loop never names a provider.
 */
export const VOICE_PROVIDER_IDS = ['gemini', 'grok', 'cascade'] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDER_IDS)[number];

/** Parses VOICE_PROVIDER. Unknown values fail fast instead of silently falling back. */
export function parseVoiceProviderId(value: string | undefined): VoiceProviderId {
    const id = value || 'gemini';
    if ((VOICE_PROVIDER_IDS as readonly string[]).includes(id)) {
        return id as VoiceProviderId;
    }
    throw new Error(`Unknown VOICE_PROVIDER "${id}": expected one of ${VOICE_PROVIDER_IDS.join(', ')}`);
}

/** API keys one provider needs. */
export type VoiceProviderKey = 'GOOGLE_API_KEY' | 'XAI_API_KEY' | 'DEEPGRAM_API_KEY' | 'CARTESIA_API_KEY';

/**
 * The keys each provider needs. loadEnv requires them at startup, so a
 * worker deployed without its provider's keys fails fast instead of on the
 * first room job; sessionParts requires them again as a second check.
 */
export const VOICE_PROVIDER_KEYS: Record<VoiceProviderId, VoiceProviderKey[]> = {
    gemini: ['GOOGLE_API_KEY'],
    grok: ['XAI_API_KEY'],
    cascade: ['GOOGLE_API_KEY', 'DEEPGRAM_API_KEY', 'CARTESIA_API_KEY'],
};

/** How camera frames reach the provider's model. */
export type VideoInput = 'native' | 'snapshot';

/**
 * The LiveKit session pieces one provider contributes. A realtime provider
 * (gemini, grok) supplies a single realtime model that hears, reasons and
 * speaks; the cascade supplies the STT → LLM → TTS pipeline instead.
 *
 * The provider boundary is deliberately this narrow: the AgentSession owns
 * everything that is the same for every provider — start/stop, audio in and
 * out, tool registration, interrupt, and input/output transcripts — so
 * swapping providers is a config change, never a change to the agent loop.
 * Video is the one asymmetry, and it is explicit: gemini takes the room's
 * video track natively, while grok and cascade get camera frames only as
 * periodic snapshots through the burst/vision path (LiveChannelRouter), never
 * as a live video track.
 */
export interface VoiceSessionParts {
    llm: llm.LLM | llm.RealtimeModel;
    stt?: stt.STT;
    tts?: tts.TTS;
}

/**
 * One swappable voice provider: the model pieces for a LiveKit session, plus
 * how its model sees the camera. Tools are registered on the session's
 * Agent, not here — the Master Tech's tools are the same whatever speaks.
 */
export interface VoiceProvider {
    readonly id: VoiceProviderId;
    readonly videoInput: VideoInput;
    sessionParts(): VoiceSessionParts;
}

export interface GeminiRealtimeOptions {
    model: string;
    apiKey: string;
    voice: string;
    temperature: number;
}

export interface GrokRealtimeOptions {
    model: string;
    apiKey: string;
    voice: string;
}

export interface DeepgramSttOptions {
    model: string;
    apiKey: string;
}

export interface GeminiChatOptions {
    model: string;
    apiKey: string;
    temperature: number;
}

export interface CartesiaTtsOptions {
    model: string;
    apiKey: string;
    /** Cartesia voice id. Undefined means the plugin's built-in voice. */
    voice?: string;
}

/**
 * Vendor objects behind the providers; the LiveKit plugins in production,
 * fakes in tests. One builder per vendor object so a test can fake a single
 * provider without constructing the rest.
 */
export interface VoicePlugins {
    geminiRealtime(options: GeminiRealtimeOptions): llm.RealtimeModel;
    grokRealtime(options: GrokRealtimeOptions): llm.RealtimeModel;
    deepgramStt(options: DeepgramSttOptions): stt.STT;
    geminiChat(options: GeminiChatOptions): llm.LLM;
    cartesiaTts(options: CartesiaTtsOptions): tts.TTS;
}

/** Requires a provider API key. Missing keys fail at startup, never mid-call. */
export function requiredKey(env: AgentEnv, key: VoiceProviderKey): string {
    const value = env[key];
    if (!value) {
        throw new Error(`${key} must be set for the selected voice provider`);
    }
    return value;
}

/** Builds the provider named by env.VOICE_PROVIDER. Unknown ids fail fast. */
export function createVoiceProvider(env: AgentEnv, plugins: VoicePlugins): VoiceProvider {
    switch (parseVoiceProviderId(env.VOICE_PROVIDER)) {
        case 'gemini':
            return createGeminiProvider(env, plugins);
        case 'grok':
            return createGrokProvider(env, plugins);
        case 'cascade':
            return createCascadeProvider(env, plugins);
    }
}
