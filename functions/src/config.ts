export const CONFIG = {
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || 'lemonade-3c4e7',
    LOCATION: 'us-central1',
    // "Thinking Model" for deep analysis with reasoning budget (Cloud Functions)
    GEMINI_THINKING_MODEL: 'gemini-2.5-flash',
    // "Fast Brain" for real-time interaction (Frontend)
    GEMINI_LIVE_MODEL: 'gemini-2.5-flash',
};
