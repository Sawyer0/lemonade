import { NextRequest, NextResponse } from 'next/server';
import { AcknowledgeDiagnosticJobRequestSchema, AppError, ErrorCode } from '@lemonade/core';
import { createErrorResponse, validateRequest } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { diagnosticJobStore } from '@/application/jobs/DiagnosticJobStore';
import { verifyApiKey } from '@/infrastructure/auth/verifyApiKey';

export const dynamic = 'force-dynamic';

type JobRouteContext = {
    params: {
        jobId: string;
    };
};

/**
 * POST /api/jobs/[jobId]/ack: the talker confirms it delivered every event
 * up to `seq`. A resume after a reconnect skips acked events, so a result
 * that landed while away is still delivered. Delivery is at-least-once:
 * the ack is best-effort, so a failed ack replays a result already spoken
 * rather than losing it.
 */
export const POST = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as JobRouteContext;
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        const { seq } = await validateRequest(req, AcknowledgeDiagnosticJobRequestSchema);
        if (!diagnosticJobStore.setAckedSeq(params.jobId, seq)) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Job ${params.jobId} not found.`);
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        return createErrorResponse(error);
    }
});
