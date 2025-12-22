import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import {
    IMultimodalUploadAnalyzer,
    ILiveStreamAnalyzer,
    AppError,
    ErrorCode,
    ILogger
} from '@lemonade/core';
import { verifyApiKey } from '@/app/api/utils/auth';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

export const POST = withContext(async (request: NextRequest) => {
    const logger = container.get<ILogger>(TYPES.Logger);
    let userId: string | undefined;

    try {
        const body = await request.json();

        const apiKeyValidationResponse = verifyApiKey(request);

        if (request.headers.has('X-API-KEY')) {
            if (apiKeyValidationResponse) return apiKeyValidationResponse;
            userId = body.userId; // Optional: userId from agent
        } else {
            const authHeader = request.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization token for user authentication.');
            }
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(token);
            userId = decodedToken.uid;
        }
        const { content, modelType } = body;

        if (!content || !modelType) {
            throw new AppError(ErrorCode.MISSING_REQUIRED_PARAMETERS, "Missing 'content' or 'modelType' for token counting.");
        }

        let tokenCount: number = 0;
        if (modelType === 'chat') {
            const chatAnalyzer = container.get<IMultimodalUploadAnalyzer>(TYPES.MultimodalUploadAI);
            tokenCount = await chatAnalyzer.countTokens(content);
        } else if (modelType === 'live') {
            const liveAnalyzer = container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI);
            tokenCount = await liveAnalyzer.countTokens(content);
        } else {
            throw new AppError(ErrorCode.INVALID_INPUT, `Invalid modelType: ${modelType}. Must be 'chat' or 'live'.`);
        }

        logger.info(`Token count successful`, { userId, tokenCount });
        return NextResponse.json({ tokenCount });
    } catch (error: unknown) {
        logger.error(`API Error in /api/token-count:`, error, { userId });
        return createErrorResponse(error);
    }
});

