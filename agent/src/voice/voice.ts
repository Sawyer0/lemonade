import type { llm, tts } from '@livekit/agents';
import type { AgentEnv } from '../env';

/**
 * Voice port: how the Master Tech hears and speaks. Gemini Live's native
 * audio is the default; Resemble is an optional adapter that speaks Gemini's
 * text replies when RESEMBLE_API_KEY is configured.
 */
export interface Voice {
    kind: VoiceKind;
    /** Realtime model that listens to the user and reasons over the conversation. */
    model: llm.RealtimeModel;
    /** Separate TTS, present only when the model replies in text. */
    tts?: tts.TTS;
}

export type VoiceKind = 'gemini-native-audio' | 'resemble';

export const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
export const GEMINI_VOICE = 'Puck';

export interface RealtimeModelOptions {
    model: string;
    apiKey?: string;
    voice: string;
    /** 'audio' for native speech out, 'text' when a separate TTS speaks. */
    reply: 'audio' | 'text';
    temperature: number;
}

/** Builds the vendor objects behind the port; the LiveKit plugins in production, fakes in tests. */
export interface VoiceProviders {
    realtimeModel(options: RealtimeModelOptions): llm.RealtimeModel;
    resembleTts(options: { apiKey: string; voiceUuid?: string }): tts.TTS;
}

export function selectVoiceKind(env: Pick<AgentEnv, 'RESEMBLE_API_KEY'>): VoiceKind {
    return env.RESEMBLE_API_KEY ? 'resemble' : 'gemini-native-audio';
}

export function createVoice(env: AgentEnv, providers: VoiceProviders): Voice {
    const kind = selectVoiceKind(env);
    const model = providers.realtimeModel({
        model: GEMINI_LIVE_MODEL,
        apiKey: env.GOOGLE_API_KEY,
        voice: GEMINI_VOICE,
        reply: kind === 'resemble' ? 'text' : 'audio',
        temperature: 0.7,
    });

    if (kind === 'gemini-native-audio' || !env.RESEMBLE_API_KEY) return { kind, model };
    return {
        kind,
        model,
        tts: providers.resembleTts({ apiKey: env.RESEMBLE_API_KEY, voiceUuid: env.RESEMBLE_VOICE_UUID }),
    };
}
