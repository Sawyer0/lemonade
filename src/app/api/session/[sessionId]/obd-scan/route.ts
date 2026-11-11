import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import type { ISessionService } from '@lemonade/core';
import { AppError, ErrorCode, ObdScanResultSchema } from '@lemonade/core';
import { createErrorResponse, validateRequest } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { z } from 'zod';

type ObdScanRouteContext = {
    params: {
        sessionId: string;
    };
};

// POST /api/session/[sessionId]/obd-scan (LM-03)
// Records a full OBD scan from the mobile app: the scan is validated,
// written to the case ledger as one `obd_scan` event when the session
// belongs to a case, and its stored codes join the session's obdCodes.
export const POST = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as ObdScanRouteContext;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const sessionId = z.string().uuid().parse(params.sessionId);
        const scan = await validateRequest(req, ObdScanResultSchema);

        const sessionService = container.get<ISessionService>(TYPES.SessionService);
        const recorded = await sessionService.recordObdScan(sessionId, userId, scan);

        return NextResponse.json({ data: recorded });
    } catch (error) {
        return createErrorResponse(error);
    }
});
