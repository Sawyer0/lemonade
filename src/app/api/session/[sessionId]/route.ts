import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import type { ISessionRepository } from '@lemonade/core';
import { AppError, ErrorCode, DiagnosticSessionSchema } from '@lemonade/core';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { type SessionDetailsResponseDTO } from '@/application/dtos/session.dto';
import { z } from 'zod';

type SessionRouteContext = {
    params: {
        sessionId: string;
    };
};

export const GET = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as SessionRouteContext;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const { sessionId } = params;

        const validatedSessionId = z.string().uuid().parse(sessionId);

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const session = await sessionRepo.findById(validatedSessionId);

        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found', 404);
        }

        if (session.userId !== userId) {
            throw new AppError(ErrorCode.FORBIDDEN, 'Access denied', 403);
        }

        const validatedSession = DiagnosticSessionSchema.parse(session);

        return NextResponse.json({ data: validatedSession } satisfies SessionDetailsResponseDTO);
    } catch (error) {
        return createErrorResponse(error);
    }
});
