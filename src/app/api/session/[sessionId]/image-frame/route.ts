// src/app/api/session/[sessionId]/image-frame/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/infrastructure/firebase/admin';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { AppError, ErrorCode, ILiveStreamAnalyzer, ILogger } from '@lemonade/core';
import { verifyApiKey } from '@/app/api/utils/auth';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

type ImageFrameRouteContext = {
    params: {
        sessionId: string;
    };
};

export const POST = withContext(async (request: NextRequest, context: unknown) => {
    const { params } = context as ImageFrameRouteContext;
    const logger = container.get<ILogger>(TYPES.Logger);
    const { sessionId } = params;

    try {
        const body = await request.json();

        const apiKeyValidationResponse = verifyApiKey(request);
        let userId: string;

        if (request.headers.has('X-API-KEY')) {
            if (apiKeyValidationResponse) return apiKeyValidationResponse;

            userId = body.userId;
            if (!userId) {
                throw new AppError(ErrorCode.MISSING_REQUIRED_PARAMETERS, 'userId is required in the body for API Key authenticated requests.');
            }
        } else {
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization token for user authentication.');
            }
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(token);
            userId = decodedToken.uid;
        }

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
            return NextResponse.json({ message: "No analysis returned for this image frame, possibly due to rate limits or AI decision." }, { status: 204 });
        }

        return NextResponse.json(analysis);
    } catch (error: unknown) {
        logger.error(`API Error in /api/session/${sessionId}/image-frame:`, error);
        return createErrorResponse(error);
    }
});