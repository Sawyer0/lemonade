import * as google from '@livekit/agents-plugin-google';
import { Modality } from '@google/genai';
import type { VoiceProviders } from './voice';

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
 * Voice providers backed by the LiveKit Google (Gemini Live) plugin on the
 * Gemini Developer API (GOOGLE_API_KEY). Not Vertex: Vertex ignores result
 * scheduling, and the -extended-thinking model rejects it.
 */
export const livekitVoiceProviders: VoiceProviders = {
    realtimeModel: ({ model, apiKey, voice, temperature }) =>
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
};
