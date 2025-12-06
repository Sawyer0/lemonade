export interface User {
    id: string;
    email: string;
    displayName?: string;
    photoURL?: string;
    tier: 'free' | 'pro';
    subscriptionId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserSettings {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
}
