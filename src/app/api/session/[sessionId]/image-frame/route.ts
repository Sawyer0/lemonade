// src/app/api/session/[sessionId]/image-frame/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/infrastructure/firebase/admin'; // Import for Firebase Auth
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { AppError, ErrorCode, ILiveStreamAnalyzer, ILogger } from '@lemonade/core';
import { verifyApiKey } from '@/app/api/utils/auth'; // Import API key verification utility
import { createErrorResponse } from '@/application/utils/validateRequest'; // Import createErrorResponse
import { withContext } from '@/application/utils/apiHandler'; // Import withContext

type ImageFrameRouteContext = {
    params: {
        sessionId: string;
    };
};

export const POST = withContext(async (request: NextRequest, context: ImageFrameRouteContext) => { // Corrected destructuring
    const logger = container.get<ILogger>(TYPES.Logger);
    const { sessionId } = context.params;

    try {
        const body = await request.json(); // Read body ONCE

        // --- Authentication ---
        const apiKeyValidationResponse = verifyApiKey(request);
        let userId: string;

        if (request.headers.has('X-API-KEY')) {
            // API Key is present, treat request as coming from an authorized agent
            if (apiKeyValidationResponse) return apiKeyValidationResponse; // Invalid API Key

            userId = body.userId; // Expect userId to be sent by agent
            if (!userId) {
                throw new AppError(ErrorCode.MISSING_REQUIRED_PARAMETERS, 'userId is required in the body for API Key authenticated requests.');
            }
        } else {
            // No API Key, fall back to Firebase token authentication
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization token for user authentication.');
            }
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(token);
            userId = decodedToken.uid;
        }
        // --- End Authentication ---

        const { imageData, mimeType, vehicleContext, inputTimestamp } = body;

        if (!sessionId || !imageData || !mimeType || !vehicleContext || !userId) {
            throw new AppError(ErrorCode.MISSING_REQUIRED_PARAMETERS, "Missing required parameters for image frame analysis.");
        }

        const liveStreamAnalyzer = container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI);
        const analysis = await liveStreamAnalyzer.analyzeLiveImageFrame(
            imageData,
            mimeType,
            vehicleContext,
            userId,
            sessionId,
            inputTimestamp
        );

        if (!analysis) {
            // This can happen if the AI chooses not to return an analysis (e.g., rate limiting from AI)
            return NextResponse.json({ message: "No analysis returned for this image frame, possibly due to rate limits or AI decision." }, { status: 204 });
        }

        return NextResponse.json(analysis);
    } catch (error: any) {
        logger.error(`API Error in /api/session/${sessionId}/image-frame:`, error);

        if (error instanceof AppError) {
            return NextResponse.json({ message: error.message, code: error.code }, { status: error.httpStatus });
        }
        return createErrorResponse(error); // Use central error response utility
    }
});
