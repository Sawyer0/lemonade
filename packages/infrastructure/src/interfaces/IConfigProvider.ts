export interface IConfigProvider {
    get(key: string): string | undefined;
    getOrThrow(key: string): string;
    
    // Typed Accessors for complex objects
    getFirebaseConfig(): { serviceAccountKey: string };
    getStripeConfig(): { secretKey: string; webhookSecret: string };
    getLangSmithConfig(): { enabled: boolean; project: string };
    getGoogleCloudConfig(): { project: string; location: string };
    getGeminiModel(): string;
    getSupermemoryConfig(): { API_KEY: string; SPACE_ID: string };
    getLangSmithApiKey(): string;
}
