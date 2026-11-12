import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, type EvidenceSubagentRunner } from '@lemonade/infrastructure';
import type { ILogger, ISessionService } from '@lemonade/core';
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

/**
 * LM-18: the scan's VIN is a VIN decode for the case. Launches the
 * background evidence sub-agents (recalls, TSBs, known failures, similar
 * closed cases) so their summaries land in the ledger before the tech's
 * first test. Fire-and-forget: slow research must not block the scan
 * response, and a trigger failure must never fail the scan itself. Only
 * runs when the session belongs to a case; the runner itself files each
 * case once.
 */
async function triggerEvidenceSubagents(
    sessionService: ISessionService,
    sessionId: string,
    vin: string,
): Promise<void> {
    const { session, vehicle } = await sessionService.getSessionContext(sessionId);
    if (!session.caseId) {
        return;
    }
    const runner = container.get<EvidenceSubagentRunner>(TYPES.EvidenceSubagentRunner);
    await runner.launchOnVinDecoded({
        caseId: session.caseId,
        vehicleId: vehicle.id,
        vin,
        year: vehicle.specs.year,
        make: vehicle.specs.make,
        model: vehicle.specs.model,
        ...(vehicle.specs.trim ? { trim: vehicle.specs.trim } : {}),
    });
}

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
        const logger = container.get<ILogger>(TYPES.Logger);
        const recorded = await sessionService.recordObdScan(sessionId, userId, scan);

        if (recorded.vin !== null) {
            triggerEvidenceSubagents(sessionService, sessionId, recorded.vin).catch((error: unknown) => {
                logger.error('[obd-scan] Evidence sub-agents failed', error);
            });
        }

        return NextResponse.json({ data: recorded });
    } catch (error) {
        return createErrorResponse(error);
    }
});
