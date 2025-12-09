/**
 * Frontend Configuration
 * Centralized model and service configuration
 */

export const CONFIG = {
    // AI Models
    AI_MODELS: {
        // Standard Text/Image Chat / REST Multimodal
        TEXT_INTERFACE: 'gemini-2.5-flash',

        // Agent Specific Models (Eyes & Ears Architecture)
        AGENT: {
            EYES: 'gemini-2.5-flash', // WebSocket / Realtime
            BRAIN: 'gemini-3-pro-preview',         // Tools / Context / Hard Qs
        },

        THINKING_LEVEL: 'high' as 'high' | 'low', // 'high' for depth/default, 'low' for speed
    },

    // UI Configuration
    UI: {
        THEME: 'ios' as const, // Force iOS theme for consistency (avoids hydration mismatch)
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
    GCLOUD: {
        PROJECT_ID: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',
        MEDIA_BUCKET: process.env.GCLOUD_MEDIA_BUCKET || 'lemonade-3c4e7.firebasestorage.app',
    },

    // Observability / LangSmith
    OBSERVABILITY: {
        // When true, LangSmith tracing is enabled for AI calls
        LANGSMITH_ENABLED: process.env.LANGCHAIN_TRACING_V2 === 'true',
        // Optional project name for LangSmith; falls back to env/default
        LANGSMITH_PROJECT: process.env.LANGCHAIN_PROJECT || 'lemonade-master-tech',
    },
} as const;
