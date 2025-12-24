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
    };
    getLiveKitConfig(): {
        host: string;
        apiKey: string;
        apiSecret: string;
    };
}

// Runtime value to satisfy Bun/ESM imports
export const IConfigProvider = Symbol('IConfigProvider');
