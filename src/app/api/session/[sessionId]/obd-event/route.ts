import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import type { ISessionService } from '@lemonade/core';
import {
    AppError,
    ErrorCode,
    GuidedTestPayloadSchema,
    ObdFaultWindowPayloadSchema,
    VerifyFixPayloadSchema,
} from '@lemonade/core';
import { createErrorResponse, validateRequest } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { z } from 'zod';

type ObdEventRouteContext = {
    params: {
        sessionId: string;
    };
};

// The OBD evidence that follows the scan (LM-03): a guided-test outcome,
// a saved fault window, or a verify-fix verdict. Each lands in the case
// ledger as its own typed event with source `OBD`.
const ObdEventBodySchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('guided_test'), payload: GuidedTestPayloadSchema }).strict(),
    z.object({ type: z.literal('obd_fault_window'), payload: ObdFaultWindowPayloadSchema }).strict(),
    z.object({ type: z.literal('verify_fix'), payload: VerifyFixPayloadSchema }).strict(),
]);

// POST /api/session/[sessionId]/obd-event (LM-03)
export const POST = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as ObdEventRouteContext;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const sessionId = z.string().uuid().parse(params.sessionId);
        const body = await validateRequest(req, ObdEventBodySchema);

        const sessionService = container.get<ISessionService>(TYPES.SessionService);
        await sessionService.recordObdLedgerEvent(sessionId, userId, body);

        return NextResponse.json({ data: { recorded: true, type: body.type } });
    } catch (error) {
        return createErrorResponse(error);
    }
});
