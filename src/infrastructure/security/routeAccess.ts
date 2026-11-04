/**
 * Which API routes need an authenticated user, and which need the Pro tier.
 * Kept free of Node-only imports so the edge middleware can use it.
 */
export const PROTECTED_API_PREFIXES = [
    '/api/analysis',
    '/api/chat',
    '/api/memory',
    '/api/search',
    '/api/session',
    '/api/stripe/portal',
    '/api/upload',
    '/api/vector',
    '/api/vehicles',
    '/api/voice',
] as const;

export const PRO_ONLY_API_PREFIXES = ['/api/analysis/trigger', '/api/voice', '/api/session/token'] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isProtectedApiPath(pathname: string): boolean {
    return matchesPrefix(pathname, PROTECTED_API_PREFIXES);
}

export function isProOnlyApiPath(pathname: string): boolean {
    return matchesPrefix(pathname, PRO_ONLY_API_PREFIXES);
}
