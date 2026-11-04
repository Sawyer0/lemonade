import { SHARED_CONFIG } from '@lemonade/core';

/**
 * Frontend Configuration
 * Centralized model and service configuration
 */

export const CONFIG = {
    ...SHARED_CONFIG, // Inherit all shared configurations

    // Environment
    ENV: process.env.NODE_ENV || 'development',

    // UI Configuration
    UI: {
        THEME: 'ios' as const, // Force iOS theme for consistency (avoids hydration mismatch)
    },

    // AI Configuration
    AI_MODELS: {
        ...SHARED_CONFIG.AI_MODELS,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
    },

    // Firebase Admin Configuration (Server-Side Only)
    FIREBASE: {
        get SERVICE_ACCOUNT() {
            if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return undefined;
            try {
                return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            } catch (error) {
                console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY', error);
                return undefined;
            }
        },
    },

    // Payments
    PAYMENTS: {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
        APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    },

    // API Configuration
    API: {
        TIMEOUT: 30000, // 30 seconds
        MAIN_APP_API_KEY: process.env.MAIN_APP_API_KEY || 'super-secret-master-app-key', // API Key for internal service communication
        ROUTES: {
            CHAT: '/api/chat',
            ANALYSIS_TRIGGER: '/api/analysis/trigger',
            PROFILE: '/api/profile',
            VEHICLES: '/api/vehicles',
            STRIPE_PORTAL: '/api/stripe/portal',
        },
    },
} as const;
