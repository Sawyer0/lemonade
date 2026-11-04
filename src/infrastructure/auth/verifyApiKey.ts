import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/infrastructure/config';
import { ErrorCode } from '@lemonade/core';

export function verifyApiKey(request: NextRequest): NextResponse | undefined {
    const apiKey = request.headers.get('X-API-KEY');

    if (!apiKey) {
        return NextResponse.json(
            { message: 'Authentication required: X-API-KEY header missing', code: ErrorCode.UNAUTHENTICATED },
            { status: 401 },
        );
    }

    if (apiKey !== CONFIG.API.MAIN_APP_API_KEY) {
        return NextResponse.json({ message: 'Invalid API Key', code: ErrorCode.UNAUTHENTICATED }, { status: 401 });
    }

    // If API key is valid, proceed
    return undefined; // Indicates success, no response needed
}
