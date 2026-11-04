import { NextRequest, NextResponse } from 'next/server';
import { ISessionRepository, DiagnosticSessionSchema, DiagnosticSession, IEdgeSecurityService } from '@lemonade/core';
import { createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import {
    StartSessionRequestSchema,
    type StartSessionResponseDTO,
    type SessionListResponseDTO,
} from '@/application/dtos/session.dto';

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const GET = withContext(async (req: NextRequest) => {
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        const userId = auth.userId;
        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const sessions = await sessionRepo.findByUserId(userId);

        // Validate sessions before returning
        const validatedSessions = z.array(DiagnosticSessionSchema).parse(sessions);

        return NextResponse.json({ data: validatedSessions } satisfies SessionListResponseDTO);
    } catch (error) {
        return createErrorResponse(error);
    }
});

export const POST = withContext(async (req: NextRequest) => {
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        const userId = auth.userId;
        const body = await req.json();
        const validatedBody = StartSessionRequestSchema.parse(body);

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);

        const newSessionId = uuidv4();
        const newSession: DiagnosticSession = {
            id: newSessionId,
            userId: userId,
            vehicleId: validatedBody.vehicleId,
            status: 'active',
            complaint: validatedBody.complaint ?? null,
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
