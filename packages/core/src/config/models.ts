/**
 * Every model ID in the repo lives here, and only here.
 *
 * A lint rule in the root `eslint.config.mjs` fails on any of these strings
 * written anywhere else, so a model change is one edit in this file instead
 * of a hunt through every package. Import the constant you need; never copy
 * the string.
 */

/** Realtime voice model for the LiveKit agent (Gemini Developer API). */
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';

/** Realtime voice model on Vertex AI. Retires Dec 13, 2026; do not use for new paths. */
export const GEMINI_LIVE_VERTEX_MODEL = 'gemini-live-2.5-flash-native-audio';

/** Default chat and worker model. */
export const GEMINI_FLASH_MODEL = 'gemini-2.5-flash';

/** Deep diagnostic reasoning model. */
export const GEMINI_PRO_MODEL = 'gemini-2.5-pro';

/** Text embedding model. */
export const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';

/** Text-to-speech model used by the live agent test to synthesise questions. */
export const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
