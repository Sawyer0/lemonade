import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for generating trace IDs

// Firebase ID Token Verification (Edge Compatible)
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

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
  // --- Distributed Tracing: Step 1 (Generate/Propagate Trace ID) ---
  const traceId = request.headers.get('x-trace-id') || uuidv4();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-trace-id', traceId);
  

  const protectedPaths = ['/api/analysis', '/api/chat', '/api/vehicles', '/api/upload', '/api/stripe/portal', '/api/sessions', '/api/voice', '/session/start'];

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

    const proOnlyPaths = ['/api/analysis/trigger', '/api/voice'];

    if (proOnlyPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
      if (userTier !== 'pro') {
        return NextResponse.json(
          { error: 'Upgrade Required', code: 'PRO_REQUIRED' },
          { status: 403 }
        );
      }
    }

    requestHeaders.set('x-user-id', payload.sub!);
    requestHeaders.set('x-user-tier', userTier);

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

