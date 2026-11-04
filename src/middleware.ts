import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
// Import directly from the edge-safe file to avoid Node.js dependency leaks
import { EdgeSecurityService, UpstashRateLimiter, Logger } from '@lemonade/infrastructure/src/edge';
import { isProOnlyApiPath, isProtectedApiPath } from '@/infrastructure/security/routeAccess';

const logger = new Logger();
const securityService = new EdgeSecurityService();
const rateLimiter = new UpstashRateLimiter();

export async function middleware(request: NextRequest) {
    const traceId = request.headers.get('x-trace-id') || uuidv4();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-trace-id', traceId);

    const pathname = request.nextUrl.pathname;

    if (isProtectedApiPath(pathname)) {
        let userId: string | null = null;
        let userTier: 'free' | 'pro' = 'free';

        // --- Secure Dev Bypass ---
        const devBypassSecret = process.env.DEV_BYPASS_SECRET;
        const providedBypass = request.headers.get('x-dev-bypass');

        if (devBypassSecret && providedBypass === devBypassSecret) {
            userId = request.headers.get('x-user-id') || 'dev-user-default';
            userTier = (request.headers.get('x-user-tier') as 'free' | 'pro') || 'pro';
            logger.info('Security: Dev Bypass Triggered', { traceId, userId, userTier });
        } else {
            // --- Standard Auth ---
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                logger.warn('Security: Missing Token', { traceId, pathname });
                return NextResponse.json({ error: 'Unauthorized: Missing Token' }, { status: 401 });
            }

            const token = authHeader.split(' ')[1];
            const payload = await securityService.verifyToken(token);

            if (!payload) {
                logger.warn('Security: Invalid Token', { traceId, pathname });
                return NextResponse.json({ error: 'Unauthorized: Invalid Token' }, { status: 401 });
            }

            userId = payload.sub as string;
            userTier = (payload.stripe_role as 'free' | 'pro') || 'free';
        }

        // 1. Rate Limiting (Skip for Dev Bypass if desired, but good to test)
        const ratelimit = await rateLimiter.limit(userId, userTier);
        if (!ratelimit.success) {
            logger.error('Security: Rate Limit Exceeded', undefined, { traceId, userId, userTier });
            return NextResponse.json(
                { error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' },
                { 
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': ratelimit.limit.toString(),
                        'X-RateLimit-Remaining': ratelimit.remaining.toString(),
                        'X-RateLimit-Reset': ratelimit.reset.toString(),
                    }
                }
            );
        }

        // 2. Pro Gating
        if (isProOnlyApiPath(pathname)) {
            if (userTier !== 'pro') {
                logger.warn('Security: Access Denied - Pro Tier Required', { traceId, userId, pathname });
                return NextResponse.json(
                    { error: 'Upgrade Required', code: 'PRO_REQUIRED' },
                    { status: 403 }
                );
            }
        }

        // 3. Inject & Seal Headers
        requestHeaders.set('x-user-id', userId);
        requestHeaders.set('x-user-tier', userTier);
        
        // HMAC Seal
        const signature = await securityService.signPayload({
            'x-user-id': userId,
            'x-user-tier': userTier,
            'x-trace-id': traceId
        });
        requestHeaders.set('x-security-seal', signature);

        return NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });
    }

    return NextResponse.next({
        request: {
            headers: requestHeaders
        }
    });
}

export const config = {
    matcher: '/api/:path*',
};
