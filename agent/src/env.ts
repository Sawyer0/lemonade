import { parseVoiceProviderId, requiredKey, VOICE_PROVIDER_KEYS, type VoiceProviderId } from './voice/provider';

/**
 * Environment for the LiveKit agent worker and its token server.
 * LiveKit credentials fall back to the `livekit-server --dev` defaults only
 * outside production, so a misconfigured deploy fails at startup.
 */
export interface AgentEnv {
    LIVEKIT_URL: string;
    LIVEKIT_API_KEY: string;
    LIVEKIT_API_SECRET: string;
    PORT: number;
    /** Voice provider for the live agent (LM-39): gemini, grok, or cascade. Defaults to gemini. */
    VOICE_PROVIDER: VoiceProviderId;
    /** Gemini API key used by the realtime voice model and the cascade LLM. */
    GOOGLE_API_KEY?: string;
    /** xAI API key used by the Grok voice provider. */
    XAI_API_KEY?: string;
    /** Deepgram API key used by the cascade provider's speech-to-text. */
    DEEPGRAM_API_KEY?: string;
    /** Cartesia API key used by the cascade provider's text-to-speech. */
    CARTESIA_API_KEY?: string;
    /** Cartesia voice id for the cascade provider. Defaults to the plugin's built-in voice. */
    CARTESIA_VOICE_ID?: string;
    /** Base URL of the Lemonade app hosting the diagnostic job service (LM-14). Defaults to local dev. */
    JOBS_BASE_URL: string;
    /**
     * API key the agent sends the job service (X-API-KEY). Defaults to the
     * app's own dev default (see src/infrastructure/config.ts); set
     * MAIN_APP_API_KEY on both sides in production.
     */
    MAIN_APP_API_KEY: string;
}

type Source = Record<string, string | undefined>;

const DEV_DEFAULTS = { LIVEKIT_URL: 'ws://localhost:7880', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' };

export function loadEnv(source: Source = process.env): AgentEnv {
    const production = source.NODE_ENV === 'production';
    const required = (name: keyof typeof DEV_DEFAULTS): string => {
        const value = source[name];
        if (value) return value;
        if (production) throw new Error(`${name} must be set in production`);
        return DEV_DEFAULTS[name];
    };

    const provider = parseVoiceProviderId(source.VOICE_PROVIDER);
    const env: AgentEnv = {
        LIVEKIT_URL: source.LIVEKIT_URL || source.LIVEKIT_HOST || required('LIVEKIT_URL'),
        LIVEKIT_API_KEY: required('LIVEKIT_API_KEY'),
        LIVEKIT_API_SECRET: required('LIVEKIT_API_SECRET'),
        PORT: Number(source.PORT || 3001),
        VOICE_PROVIDER: provider,
        GOOGLE_API_KEY: source.GOOGLE_API_KEY || source.GEMINI_API_KEY || undefined,
        XAI_API_KEY: source.XAI_API_KEY || undefined,
        DEEPGRAM_API_KEY: source.DEEPGRAM_API_KEY || undefined,
        CARTESIA_API_KEY: source.CARTESIA_API_KEY || undefined,
        CARTESIA_VOICE_ID: source.CARTESIA_VOICE_ID || undefined,
        JOBS_BASE_URL: source.JOBS_BASE_URL || 'http://localhost:3000',
        MAIN_APP_API_KEY: source.MAIN_APP_API_KEY || 'super-secret-master-app-key',
    };

    // The provider's keys are needed before any room job: sessionParts() is
    // only called in the job entry, after connect, so without this check a
    // worker deployed without its provider's keys boots cleanly and fails
    // on the first call instead of at startup.
    for (const key of VOICE_PROVIDER_KEYS[provider]) {
        requiredKey(env, key);
    }
    return env;
}
