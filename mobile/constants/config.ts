import { SHARED_CONFIG } from '@lemonade/core';
import { AUTO_CLICK_CONTINUE_SCRIPT, WEBVIEW_USER_AGENT, injectGoogleTokenScript } from './webBridgeScripts';

// Mobile configuration
// Adapted from src/infrastructure/config.ts but for React Native environment

export const CONFIG = {
    ...SHARED_CONFIG, // Inherit all shared configurations
    API: {
        TIMEOUT: 30000,
        // Set EXPO_PUBLIC_API_URL to the web server reachable from the device;
        // 10.0.2.2 is the host machine from the Android emulator.
        BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000',
        USER_AGENT: WEBVIEW_USER_AGENT,
    },
    SCRIPTS: {
        AUTO_CLICK_CONTINUE: AUTO_CLICK_CONTINUE_SCRIPT,
        INJECT_TOKEN: injectGoogleTokenScript,
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
