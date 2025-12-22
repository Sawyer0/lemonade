import { SHARED_CONFIG } from '@lemonade/core';

export const CONFIG = {
    ...SHARED_CONFIG, // Inherit all shared configurations
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    LOCATION: 'us-central1',
    // "Thinking Model" for deep analysis with reasoning budget (Cloud Functions)
    GEMINI_THINKING_MODEL: 'gemini-2.5-pro',
    STRIPE: {
        SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
        WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
    FIREBASE: {
        SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
    }
};
