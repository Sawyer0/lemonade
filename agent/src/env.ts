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
    /** Gemini API key used by the realtime voice model. */
    GOOGLE_API_KEY?: string;
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
        GOOGLE_API_KEY: source.GOOGLE_API_KEY || source.GEMINI_API_KEY || undefined,
    };
}
