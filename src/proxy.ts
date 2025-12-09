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

export async function proxy(request: NextRequest) {
  // 1. Protect Sensitive Endpoints
  // We protect /api/analysis (AI triggers), /api/chat (AI chat), /api/voice (Voice Processing)
  const protectedPaths = ['/api/analysis', '/api/chat', '/api/vehicles', '/api/upload', '/api/stripe/portal', '/api/sessions', '/api/voice'];

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

    const userTier = (payload.stripe_role as string) || 'free';

    // 2. Pro Tier Gate (Feature Gating)
    // Rule: Deep Analysis (/api/analysis/trigger) and Voice (/api/voice) require PRO.
    // Rule: Basic Chat and Upload is allowed for Free (upload is gated elsewhere or allowed for MVP).
    const proOnlyPaths = ['/api/analysis/trigger', '/api/voice'];
    
    if (proOnlyPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
       if (userTier !== 'pro') {
         // Return 403 Forbidden for Free users trying to access Pro features
         return NextResponse.json(
           { error: 'Upgrade Required', code: 'PRO_REQUIRED' },
           { status: 403 }
         );
       }
    }

    // Success! Pass through.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub!);
    requestHeaders.set('x-user-tier', userTier);

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