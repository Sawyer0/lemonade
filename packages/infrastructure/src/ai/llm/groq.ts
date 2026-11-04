import { OpenAICompatibleClient } from './OpenAICompatibleClient';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** Groq production model (console.groq.com/docs/models); override with GROQ_MODEL. */
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

export class MissingApiKeyError extends Error {
    constructor(variable: string, hint: string) {
        super(`${variable} is not set. ${hint}`);
        this.name = 'MissingApiKeyError';
    }
}

type Env = Record<string, string | undefined>;

/** Builds the Groq client from environment variables, failing loudly without a key. */
export function createGroqClient(env: Env = process.env, fetchImpl?: typeof fetch): OpenAICompatibleClient {
    const apiKey = env.GROQ_API_KEY?.trim();
    if (!apiKey) {
        throw new MissingApiKeyError(
            'GROQ_API_KEY',
            'Create a free key at https://console.groq.com/keys and add it to .env.local (see .env.example).',
        );
    }
    return new OpenAICompatibleClient({
        baseUrl: env.GROQ_BASE_URL?.trim() || GROQ_BASE_URL,
        apiKey,
        model: env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
        fetchImpl,
    });
}

export type LlmProvider = 'vertex' | 'groq';

/** Reads LLM_PROVIDER; Vertex AI stays the default so existing deployments are unchanged. */
export function resolveLlmProvider(env: Env = process.env): LlmProvider {
    const value = env.LLM_PROVIDER?.trim().toLowerCase();
    if (!value || value === 'vertex') return 'vertex';
    if (value === 'groq') return 'groq';
    throw new Error(`Unsupported LLM_PROVIDER "${env.LLM_PROVIDER}". Use "vertex" or "groq".`);
}
