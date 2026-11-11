import type { llm } from '@livekit/agents';
import { GEMINI_LIVE_MODEL } from '@lemonade/core';
import type { AgentEnv } from '../env';

/**
 * Voice port: how the Master Tech hears and speaks. Gemini Live's native
 * audio is the only mode: 3.8 Live outputs audio, so there is no text-reply
 * path and no separate TTS.
 */
export interface Voice {
    kind: 'gemini-native-audio';
    /** Realtime model that listens to the user and reasons over the conversation. */
    model: llm.RealtimeModel;
}

export const GEMINI_VOICE = 'Puck';

export interface RealtimeModelOptions {
    model: string;
    apiKey?: string;
    voice: string;
    temperature: number;
}

/** Builds the vendor objects behind the port; the LiveKit plugins in production, fakes in tests. */
export interface VoiceProviders {
    realtimeModel(options: RealtimeModelOptions): llm.RealtimeModel;
}

export function createVoice(env: AgentEnv, providers: VoiceProviders): Voice {
    const model = providers.realtimeModel({
        model: GEMINI_LIVE_MODEL,
        apiKey: env.GOOGLE_API_KEY,
        voice: GEMINI_VOICE,
        temperature: 0.7,
    });
    return { kind: 'gemini-native-audio', model };
}
