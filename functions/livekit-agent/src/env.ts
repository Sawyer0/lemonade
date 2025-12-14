// functions/livekit-agent/src/env.ts
// Centralized environment variables for the LiveKit agent server

interface Env {
    LIVEKIT_HOST: string;
    LIVEKIT_API_KEY: string;
    LIVEKIT_API_SECRET: string;
    PORT?: string;
    LIVEKIT_AGENT_AUDIO_CHUNK_INTERVAL_MS?: string;
    LIVEKIT_AGENT_VIDEO_FRAME_INTERVAL_MS?: string;
    MAIN_APP_BASE_URL: string; // New: Base URL for the main Next.js application API
    MAIN_APP_API_KEY: string; // New: API Key for LiveKit Agent to authenticate with main app
}

export const env: Env = {
    LIVEKIT_HOST: process.env.LIVEKIT_HOST || 'http://localhost:7880', // Default to local LiveKit
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey', // Default dev key
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret', // Default dev secret
    PORT: process.env.PORT || '3001',
    LIVEKIT_AGENT_AUDIO_CHUNK_INTERVAL_MS: process.env.LIVEKIT_AGENT_AUDIO_CHUNK_INTERVAL_MS,
    LIVEKIT_AGENT_VIDEO_FRAME_INTERVAL_MS: process.env.LIVEKIT_AGENT_VIDEO_FRAME_INTERVAL_MS,
    MAIN_APP_BASE_URL: process.env.MAIN_APP_BASE_URL || 'http://localhost:3000', // Default to main app dev server
    MAIN_APP_API_KEY: process.env.MAIN_APP_API_KEY || 'super-secret-agent-key', // Default dev key
};
