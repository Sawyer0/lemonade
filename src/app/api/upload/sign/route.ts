import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { StorageService } from '@/infrastructure/storage/StorageService';
import { AppError, ErrorCode, ILogger, ISessionRepository } from '@lemonade/core';
import { SignRequestSchema, SignResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';

export const POST = withContext(async (req: Request) => {
    const logger = container.get<ILogger>(TYPES.Logger);

    try {
        const { contentType, sessionId } = await validateRequest(req, SignRequestSchema);

        // Verify User has Permission to this Session
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            throw new AppError(ErrorCode.UNAUTHENTICATED, 'User not authenticated');
        }

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const session = await sessionRepo.findById(sessionId);

        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');
        }

        if (session.userId !== userId) {
            logger.warn('[Upload/Sign] Unauthorized access attempt', {
                userId,
                expectedOwner: session.userId,
                sessionId,
            });
            throw new AppError(ErrorCode.PERMISSION_DENIED, 'You do not have permission to upload to this session');
        }

        const storageService = container.get<StorageService>(TYPES.StorageService);

        let extension = contentType.split('/')[1];
        if (extension === 'quicktime') extension = 'mov';

        const filename = `sessions/${sessionId}/${Date.now()}.${extension}`;

        logger.info('[Upload/Sign] Generating signed URL', { filename, userId });
        const { uploadUrl, publicUrl } = await storageService.generateSignedUrl(filename, contentType);

        const validatedResponse = validateResponse({ uploadUrl, publicUrl }, SignResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        logger.error('[Upload/Sign] Error', error as Error);
        return createErrorResponse(error);
    }
});
