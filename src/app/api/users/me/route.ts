import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/infrastructure/firebase/admin';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import { createErrorResponse } from '@/application/utils/validateRequest';

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const userDoc = await adminDb.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            return NextResponse.json({
                data: { tier: 'free', id: userId } // Default to free if no doc
            });
        }

        return NextResponse.json({
            data: userDoc.data()
        });

    } catch (error) {
        return createErrorResponse(error);
    }
}
