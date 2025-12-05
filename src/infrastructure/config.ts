/**
 * Frontend Configuration
 * Centralized model and service configuration
 */

export const CONFIG = {
    // AI Models
    AI_MODELS: {
        // Primary model for both chat and video analysis with thinking budget
        PRIMARY: 'gemini-2.5-flash',
    },
    
    // API Configuration
    API: {
        TIMEOUT: 30000, // 30 seconds
    },

    // Google Cloud
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',
} as const;
