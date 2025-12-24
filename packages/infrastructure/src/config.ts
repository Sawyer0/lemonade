import { SHARED_CONFIG } from '@lemonade/core';

export const CONFIG = {
    ...SHARED_CONFIG,
    // Add server-side specific configs here
    STRIPE: {
        SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
        WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
    FIREBASE: {
        SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
    },
    SUPERMEMORY: {
        API_KEY: process.env.SUPERMEMORY_API_KEY || '',
        SPACE_ID: process.env.SUPERMEMORY_SPACE_ID || '',
    },
    LANGSMITH: {
        API_KEY: process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY || '',
    },
    UPSTASH: {
        REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
        REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    },
    SECURITY: {
        INTERNAL_SECRET: process.env.SECURITY_INTERNAL_SECRET || 'dev-internal-secret-lemonade',
    },
    // Override GCLOUD with explicit env if needed, or rely on core's fallback
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || SHARED_CONFIG.GCLOUD.PROJECT_ID,
    LOCATION: process.env.GCLOUD_LOCATION || 'us-central1',
    GEMINI_THINKING_MODEL: 'gemini-2.5-pro',
};
