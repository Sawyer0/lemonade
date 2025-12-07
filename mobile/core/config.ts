export const CONFIG = {
    API: {
        // Use the ENV variable if set, otherwise default to Android Localhost (10.0.2.2) 
        // which points to the host machine's localhost:3000
        BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000',
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
