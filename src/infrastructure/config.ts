/**
 * Frontend Configuration
 * Centralized model and service configuration
 */

export const CONFIG = {
    // AI Models
    AI_MODELS: {
        // Primary model for both chat and video analysis with thinking budget
        PRIMARY: 'gemini-2.5-pro',
        // Video requires a vision-capable model; Gemini 2.5 Pro does not support video
        VIDEO_PRIMARY: 'gemini-2.5-pro',
        THINKING_LEVEL: 'high' as 'high' | 'low', // 'high' for depth/default, 'low' for speed
    },

    // API Configuration
    API: {
        TIMEOUT: 30000, // 30 seconds
        ROUTES: {
            CHAT: '/api/chat',
            ANALYSIS_TRIGGER: '/api/analysis/trigger',
        }
    },

    // Google Cloud
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',

    // Observability / LangSmith
    OBSERVABILITY: {
        // When true, LangSmith tracing is enabled for AI calls
        LANGSMITH_ENABLED: process.env.LANGCHAIN_TRACING_V2 === 'true',
        // Optional project name for LangSmith; falls back to env/default
        LANGSMITH_PROJECT: process.env.LANGCHAIN_PROJECT || 'lemonade-master-tech',
    },
} as const;
