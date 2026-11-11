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
    VOICE_PROVIDER: string;
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

    return {
        LIVEKIT_URL: source.LIVEKIT_URL || source.LIVEKIT_HOST || required('LIVEKIT_URL'),
        LIVEKIT_API_KEY: required('LIVEKIT_API_KEY'),
        LIVEKIT_API_SECRET: required('LIVEKIT_API_SECRET'),
        PORT: Number(source.PORT || 3001),
        VOICE_PROVIDER: source.VOICE_PROVIDER || 'gemini',
        GOOGLE_API_KEY: source.GOOGLE_API_KEY || source.GEMINI_API_KEY || undefined,
        XAI_API_KEY: source.XAI_API_KEY || undefined,
        DEEPGRAM_API_KEY: source.DEEPGRAM_API_KEY || undefined,
        CARTESIA_API_KEY: source.CARTESIA_API_KEY || undefined,
        CARTESIA_VOICE_ID: source.CARTESIA_VOICE_ID || undefined,
    };
}
