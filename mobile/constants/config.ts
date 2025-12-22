import { SHARED_CONFIG } from '@lemonade/core';

// Mobile configuration
// Adapted from src/infrastructure/config.ts but for React Native environment

export const CONFIG = {
    ...SHARED_CONFIG, // Inherit all shared configurations
    API: {
        TIMEOUT: 30000,
        // Using IP for local development if needed, or production URL
        BASE_URL: 'http://localhost:3000', 
    },
} as const;
