// Mobile configuration
// Adapted from src/infrastructure/config.ts but for React Native environment

export const CONFIG = {
    AI_MODELS: {
        CHAT_MODEL: 'gemini-2.5-flash',
        LIVE_MODEL: 'gemini-live-2.5-flash-native-audio',
    },
    API: {
        TIMEOUT: 30000,
        // Using IP for local development if needed, or production URL
        BASE_URL: 'http://localhost:3000', 
    },
    UI: {
        THEME: 'ios' as const,
    }
} as const;
