import { NextResponse } from 'next/server';
import { adminStorage } from '@/infrastructure/firebase/admin';
import { withContext } from '@/application/utils/apiHandler';

export const GET = withContext(async () => {
    try {
        const bucket = adminStorage.bucket();
        await bucket.setCorsConfiguration([
            {
                origin: ['*'], // Allow all origins (tunnels, localhost, etc.)
                method: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
                responseHeader: ['*'],
                maxAgeSeconds: 0 // Disable caching
            }
        ]);
        return NextResponse.json({ success: true, message: `CORS configured for ${bucket.name} to allow *` });
    } catch (error) {
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
});

