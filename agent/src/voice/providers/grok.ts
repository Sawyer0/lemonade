import { GROK_VOICE, GROK_VOICE_MODEL } from '@lemonade/core';
import type { AgentEnv } from '../../env';
import { requiredKey, type VoicePlugins, type VoiceProvider, type VoiceSessionParts } from '../provider';

/**
 * Grok Voice 3.0 over the xAI Voice Agent API (WebSocket). One realtime
 * model, like Gemini — but the xAI docs we checked don't describe video
 * input, so camera frames reach the model only as periodic snapshots through
 * the burst/vision path, never as a live video track.
 */
export function createGrokProvider(env: AgentEnv, plugins: VoicePlugins): VoiceProvider {
    return {
        id: 'grok',
        videoInput: 'snapshot',
        sessionParts(): VoiceSessionParts {
            return {
                llm: plugins.grokRealtime({
                    model: GROK_VOICE_MODEL,
                    apiKey: requiredKey(env, 'XAI_API_KEY'),
                    voice: GROK_VOICE,
                }),
            };
        },
    };
}
