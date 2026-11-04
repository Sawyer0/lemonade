import * as google from '@livekit/agents-plugin-google';
import * as resemble from '@livekit/agents-plugin-resemble';
import { Modality } from '@google/genai';
import type { VoiceProviders } from './voice';

/** Voice providers backed by the LiveKit Google (Gemini Live) and Resemble plugins. */
export const livekitVoiceProviders: VoiceProviders = {
    realtimeModel: ({ model, apiKey, voice, reply, temperature }) =>
        new google.beta.realtime.RealtimeModel({
            model,
            apiKey,
            voice,
            temperature,
            modalities: [reply === 'audio' ? Modality.AUDIO : Modality.TEXT],
        }),
    resembleTts: ({ apiKey, voiceUuid }) => new resemble.TTS({ apiKey, ...(voiceUuid ? { voiceUuid } : {}) }),
};
