import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/infrastructure/firebase/admin';
import { AppError, ErrorCode, UserSchema, User } from '@lemonade/core';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';
import { UpdateUserProfileRequestSchema, UserResponseSchema, type UserResponseDTO } from '@/application/dtos/user.dto';

export const GET = withContext(async (req: NextRequest) => {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const userDoc = await adminDb.collection('users').doc(userId).get();

        let userData: User;

        if (!userDoc.exists) {
            // Default data for new users, ensuring it's a valid User structure
            userData = UserSchema.parse({
                id: userId,
                email: decodedToken.email,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        } else {
            userData = UserSchema.parse(userDoc.data());
        }

        return NextResponse.json({ data: userData } satisfies UserResponseDTO);

    } catch (error) {
        return createErrorResponse(error);
    }
});

export const PATCH = withContext(async (req: NextRequest) => {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const body = await req.json();
        const validatedBody = UpdateUserProfileRequestSchema.parse(body);

        // Update user document in Firestore
        await adminDb.collection('users').doc(userId).set(validatedBody, { merge: true });

        // Fetch the updated user data to return a consistent response
        const updatedUserDoc = await adminDb.collection('users').doc(userId).get();
        const userData = UserSchema.parse(updatedUserDoc.data());

        return NextResponse.json({ data: userData } satisfies UserResponseDTO);

    } catch (error) {
        return createErrorResponse(error);
    }
});


