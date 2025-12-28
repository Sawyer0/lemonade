import { SHARED_CONFIG } from '@lemonade/core';

// Mobile configuration
// Adapted from src/infrastructure/config.ts but for React Native environment

export const CONFIG = {
    ...SHARED_CONFIG, // Inherit all shared configurations
    API: {
        TIMEOUT: 30000,
        // Using network IP for Android emulator/device to reach dev server
        BASE_URL: 'http://192.168.1.154:3000',
    },
    LOCAL_INFERENCE: {
        GPU_LAYERS: 99,
        CONTEXT_SIZE: 1024,
        USE_FLASH_ATTN: true,
        MODEL_FILENAME: 'SmolVLM2-2.2B-Instruct-Q4_K_M.gguf',
    },
    AUTH: {
        GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
    },
} as const;
