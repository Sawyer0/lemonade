/**
 * Runs once when a Next.js server starts. Checks required server secrets here so a
 * misconfigured production deployment fails at startup instead of on its first
 * authenticated request. `next build` also loads this file; the check is skipped
 * there because build machines do not hold runtime secrets.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_PHASE === 'phase-production-build') return;

    const { resolveInternalSecret } = await import('@lemonade/infrastructure/src/security/internalSecret');
    try {
        resolveInternalSecret();
    } catch (error) {
        // Next.js logs a failed hook but keeps the process alive; exit so the
        // platform sees a crashed deployment instead of a server that cannot serve.
        if (process.env.NEXT_RUNTIME === 'nodejs') {
            console.error(error);
            process.exit(1);
        }
        throw error;
    }
}
