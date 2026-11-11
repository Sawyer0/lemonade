import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as google from '@livekit/agents-plugin-google';
import * as xai from '@livekit/agents-plugin-xai';
import { Modality } from '@google/genai';
import type { VoicePlugins } from './provider';

/**
 * Context window compression for the live session. Gemini starts compressing
 * the context once it passes the trigger and slides the window back to the
 * target, so a session with video survives past the ~2 minute wall the
 * uncompressed window hits. Values are token counts, as strings: that is
 * the shape the Gemini API's ContextWindowCompressionConfig takes.
 */
export const CONTEXT_COMPRESSION_TRIGGER_TOKENS = '64000';
export const CONTEXT_COMPRESSION_TARGET_TOKENS = '32000';

/**
 * Voice plugins backed by the LiveKit vendor plugins. Gemini runs on the
 * Gemini Developer API (GOOGLE_API_KEY), not Vertex: Vertex ignores result
 * scheduling, and the -extended-thinking model rejects it. Grok runs on the
 * xAI Voice Agent API (XAI_API_KEY); the xai plugin defaults to
 * wss://api.x.ai/v1.
 */
export const livekitPlugins: VoicePlugins = {
    geminiRealtime: ({ model, apiKey, voice, temperature }) =>
        new google.realtime.RealtimeModel({
            model,
            apiKey,
            voice,
            temperature,
            // Gemini Developer API, not Vertex: Vertex ignores result
            // scheduling, and the model choice must not leak in from the
            // GOOGLE_GENAI_USE_VERTEXAI environment default.
            vertexai: false,
            modalities: [Modality.AUDIO],
            contextWindowCompression: {
                triggerTokens: CONTEXT_COMPRESSION_TRIGGER_TOKENS,
                slidingWindow: { targetTokens: CONTEXT_COMPRESSION_TARGET_TOKENS },
            },
        }),
    grokRealtime: ({ model, apiKey, voice }) =>
        new xai.realtime.RealtimeModel({
            model,
            apiKey,
            voice,
        }),
    deepgramStt: ({ model, apiKey }) =>
        new deepgram.STT({
            model,
            apiKey,
        }),
    geminiChat: ({ model, apiKey, temperature }) =>
        new google.LLM({
            model,
            apiKey,
            temperature,
            vertexai: false,
        }),
    cartesiaTts: ({ model, apiKey, voice }) =>
        new cartesia.TTS({
            model,
            apiKey,
            ...(voice ? { voice } : {}),
        }),
};
