import { Platform } from 'react-native';

const getBaseUrl = () => {
    // 1. Prefer explicit ENV variable
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

    // 2. Android (Physical Device with ADB Reverse)
    if (Platform.OS === 'android') return 'http://localhost:3000';

    // 3. iOS Simulator or Web
    return 'http://localhost:3000';
};

export const CONFIG = {
    API: {
        BASE_URL: getBaseUrl(),
        USER_AGENT: 'LemonadeMobile/1.0',
    },
    AUTH: {
        GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '', // Should be set in .env
    },
    SCRIPTS: {
        // Script to inject the Google ID Token into the web app session storage and global window object
        INJECT_TOKEN: (token: string) => `
            (function() {
                const token = ${JSON.stringify(token)};
                console.log("Native Google Sign-In successful, bridging token...");
                if (window.handleNativeGoogleLogin) {
                    window.handleNativeGoogleLogin(token);
                } else {
                    console.warn("window.handleNativeGoogleLogin is not defined yet.");
                    sessionStorage.setItem('google_id_token', token);
                }
            })();
            true;
        `,
        // Script to auto-click "Continue" on tunnel warning pages
        AUTO_CLICK_CONTINUE: `
            setTimeout(function () {
                var btn = document.querySelector('button');
                if (btn && btn.innerText.toLowerCase().includes('continue')) {
                    btn.click();
                }
            }, 500);
            true;
        `
    }
} as const;
