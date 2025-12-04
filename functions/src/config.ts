export const CONFIG = {
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',
    LOCATION: 'us-central1',
    // "Slow Brain" for deep analysis (Cloud Functions)
    GEMINI_THINKING_MODEL: 'gemini-2.0-flash-thinking-exp-1219',
    // "Fast Brain" for real-time interaction (Frontend)
    GEMINI_LIVE_MODEL: 'gemini-2.0-flash-exp',
};
