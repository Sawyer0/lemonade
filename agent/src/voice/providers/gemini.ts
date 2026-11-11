import { GEMINI_LIVE_MODEL, GEMINI_VOICE } from '@lemonade/core';
import type { AgentEnv } from '../../env';
import { requiredKey, type VoicePlugins, type VoiceProvider, type VoiceSessionParts } from '../provider';

/**
 * Gemini 3.8 Live (native audio), the default provider. The realtime model
 * hears, reasons and speaks in one stream, and takes the room's video track
 * natively — no separate STT, LLM or TTS.
 */
export function createGeminiProvider(env: AgentEnv, plugins: VoicePlugins): VoiceProvider {
    return {
        id: 'gemini',
        videoInput: 'native',
        sessionParts(): VoiceSessionParts {
            return {
                llm: plugins.geminiRealtime({
                    model: GEMINI_LIVE_MODEL,
                    apiKey: requiredKey(env, 'GOOGLE_API_KEY'),
                    voice: GEMINI_VOICE,
                    temperature: 0.7,
                }),
            };
        },
    };
}
