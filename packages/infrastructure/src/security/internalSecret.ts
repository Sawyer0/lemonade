/**
 * Fixed key used only outside production so local runs and tests work with no
 * setup. Never valid in production: resolveInternalSecret refuses to return it.
 */
export const DEV_ONLY_INTERNAL_SECRET = 'dev-only-insecure-internal-secret';

/** Shortest SECURITY_INTERNAL_SECRET accepted in production (`openssl rand -hex 32` gives 64). */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

export class InternalSecretError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InternalSecretError';
    }
}

type Env = Record<string, string | undefined>;

/**
 * The HMAC key that seals identity headers between the middleware and API routes.
 * Production requires SECURITY_INTERNAL_SECRET of at least 32 characters and throws
 * otherwise; development and tests fall back to DEV_ONLY_INTERNAL_SECRET.
 */
export function resolveInternalSecret(env: Env = process.env): string {
    const secret = env.SECURITY_INTERNAL_SECRET?.trim();
    const isProduction = env.NODE_ENV === 'production';

    if (!isProduction) return secret || DEV_ONLY_INTERNAL_SECRET;

    if (!secret) {
        throw new InternalSecretError(
            'SECURITY_INTERNAL_SECRET is not set. Production refuses to start without it; ' +
                'generate one with `openssl rand -hex 32`.',
        );
    }
    if (secret.length < MIN_PRODUCTION_SECRET_LENGTH || secret === DEV_ONLY_INTERNAL_SECRET) {
        throw new InternalSecretError(
            `SECURITY_INTERNAL_SECRET must be a random value of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production.`,
        );
    }
    return secret;
}
