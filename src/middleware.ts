import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// Firebase ID Token Verification (Edge Compatible)
// We use 'jose' because firebase-admin is not supported in Next.js Middleware (Edge Runtime).

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Fetch Google's Public Keys (Cached automatically by jose)
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

// Helper for structured logging in Edge Runtime
function logError(message: string, error?: unknown) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    message,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error
  }));
}

async function verifyFirebaseToken(token: string) {
  if (!FIREBASE_PROJECT_ID) {
    logError("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not defined");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ['RS256'],
    });
    return payload;
  } catch (error) {
    logError("Token Verification Failed", error);
    return null;
  }
}

export async function middleware(request: NextRequest) {
  // 1. Protect Sensitive Endpoints
  // We protect /api/analysis (AI triggers) and /api/chat (AI chat)
  // We also protect /api/vehicles (User data)
  const protectedPaths = ['/api/analysis', '/api/chat', '/api/vehicles'];

  if (protectedPaths.some(path => request.nextUrl.pathname.startsWith(path))) {

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing Token' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyFirebaseToken(token);

    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Token' }, { status: 401 });
    }

    // (Optional) RBAC: Check for custom claims like 'stripe_role' here
    // if (payload.stripe_role !== 'pro') ...

    // Success! Pass through.
    // We can also set headers here to pass user info to the route handler if needed
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub!);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
