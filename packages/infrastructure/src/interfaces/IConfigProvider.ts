export interface IConfigProvider {
    getGoogleCloudConfig(): {
        projectId: string;
        location: string;
        apiKey: string;
    };
    getFirebaseConfig(): {
        apiKey: string;
        authDomain: string;
        projectId: string;
        storageBucket: string;
        messagingSenderId: string;
        appId: string;
        serviceAccountKey: string;
    };
    getLiveKitConfig(): {
        host: string;
        apiKey: string;
        apiSecret: string;
    };
    getGeminiModel(): string;
    getOrThrow(key: string): string;
    getSupermemoryConfig(): {
        API_KEY: string;
        SPACE_ID: string;
    };
    getLangSmithConfig(): {
        enabled: boolean;
        project: string;
    };
    getCaseLedgerConfig(): {
        connectionString: string | undefined;
    };
}

// Runtime value to satisfy Bun/ESM imports
export const IConfigProvider = Symbol('IConfigProvider');
