import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/infrastructure/firebase/admin';
import {
    AppError,
    ErrorCode,
    ISessionRepository,
    DiagnosticSessionSchema,
    DiagnosticSession
} from '@lemonade/core';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import {
    StartSessionRequestSchema,
    type StartSessionRequestDTO,
    type StartSessionResponseDTO,
    type SessionListResponseDTO,
} from '@/application/dtos/session.dto';

import { z } from 'zod'; // Added usage of z
import { v4 as uuidv4 } from 'uuid';

export const GET = withContext(async (req: NextRequest) => {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const sessions = await sessionRepo.findByUserId(userId); // Changed from getSessionsByUserId

        // Validate sessions before returning
        const validatedSessions = z.array(DiagnosticSessionSchema).parse(sessions);

        return NextResponse.json({ data: validatedSessions } satisfies SessionListResponseDTO);

    } catch (error) {
        return createErrorResponse(error);
    }
});

export const POST = withContext(async (req: NextRequest) => {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const body = await req.json();
        const validatedBody = StartSessionRequestSchema.parse(body);

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);

        const newSessionId = uuidv4();
        const newSession: DiagnosticSession = {
            id: newSessionId,
            userId: userId,
            vehicleId: validatedBody.vehicleId,
            status: 'active',
            complaint: validatedBody.complaint,
            obdCodes: [],
            messages: [],
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
            startedAt: new Date(),
            updatedAt: new Date(),
        };

        await sessionRepo.create(newSession);

        return NextResponse.json({ sessionId: newSession.id } satisfies StartSessionResponseDTO);

    } catch (error) {
        return createErrorResponse(error);
    }
});
