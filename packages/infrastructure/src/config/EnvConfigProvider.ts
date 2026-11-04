import { injectable } from 'inversify';
import type { IConfigProvider } from '../interfaces/IConfigProvider';
import { SHARED_CONFIG } from '@lemonade/core';
import dotenv from 'dotenv';

@injectable()
export class EnvConfigProvider implements IConfigProvider {
    constructor() {
        dotenv.config({ path: '.env.local' });
    }

    get(key: string): string | undefined {
        return process.env[key];
    }

    getOrThrow(key: string): string {
        const val = process.env[key];
        if (!val) {
            throw new Error(`Missing required configuration: ${key}`);
        }
        return val;
    }

    getFirebaseConfig() {
        return {
            apiKey: process.env.FIREBASE_API_KEY || '',
            authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
            projectId: process.env.GCLOUD_PROJECT || SHARED_CONFIG.GCLOUD.PROJECT_ID,
            storageBucket: process.env.GCLOUD_MEDIA_BUCKET || SHARED_CONFIG.GCLOUD.MEDIA_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
            appId: process.env.FIREBASE_APP_ID || '',
            serviceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
        };
    }

    getLiveKitConfig() {
        return {
            host: process.env.LIVEKIT_URL || '',
            apiKey: process.env.LIVEKIT_API_KEY || '',
            apiSecret: process.env.LIVEKIT_API_SECRET || '',
        };
    }

    getStripeConfig() {
        return {
            secretKey: process.env.STRIPE_SECRET_KEY || '',
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        };
    }

    getLangSmithConfig() {
        return {
            enabled: process.env.LANGCHAIN_TRACING_V2 === 'true',
            project: process.env.LANGCHAIN_PROJECT || SHARED_CONFIG.OBSERVABILITY.LANGSMITH_PROJECT,
        };
    }

    getGoogleCloudConfig() {
        return {
            projectId: process.env.GCLOUD_PROJECT || SHARED_CONFIG.GCLOUD.PROJECT_ID,
            location: process.env.GCLOUD_LOCATION || 'us-central1',
            apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
        };
    }

    getGeminiModel(): string {
        return 'gemini-2.5-pro'; // Default thinking model for backend
    }

    getSupermemoryConfig() {
        return {
            API_KEY: process.env.SUPERMEMORY_API_KEY || '',
            SPACE_ID: process.env.SUPERMEMORY_SPACE_ID || '',
        };
    }

    getLangSmithApiKey(): string {
        return process.env.LANGSMITH_API_KEY || '';
    }
}
