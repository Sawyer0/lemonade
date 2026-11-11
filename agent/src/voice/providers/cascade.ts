import { CARTESIA_TTS_MODEL, DEEPGRAM_STT_MODEL, GEMINI_FLASH_MODEL } from '@lemonade/core';
import type { AgentEnv } from '../../env';
import { requiredKey, type VoicePlugins, type VoiceProvider, type VoiceSessionParts } from '../provider';

/**
 * Cascade: streaming speech-to-text (Deepgram), then an LLM (Gemini chat),
 * then TTS (Cartesia), wired through LiveKit's AgentSession pipeline. No
 * realtime model, so there is no native video: camera frames reach the
 * reasoning only as periodic snapshots through the burst/vision path.
 */
export function createCascadeProvider(env: AgentEnv, plugins: VoicePlugins): VoiceProvider {
    return {
        id: 'cascade',
        videoInput: 'snapshot',
        sessionParts(): VoiceSessionParts {
            return {
                stt: plugins.deepgramStt({
                    model: DEEPGRAM_STT_MODEL,
                    apiKey: requiredKey(env, 'DEEPGRAM_API_KEY'),
                }),
                llm: plugins.geminiChat({
                    model: GEMINI_FLASH_MODEL,
                    apiKey: requiredKey(env, 'GOOGLE_API_KEY'),
                    temperature: 0.7,
                }),
                tts: plugins.cartesiaTts({
                    model: CARTESIA_TTS_MODEL,
                    apiKey: requiredKey(env, 'CARTESIA_API_KEY'),
                    voice: env.CARTESIA_VOICE_ID,
                }),
            };
        },
    };
}
