import { NextRequest, NextResponse } from 'next/server';
import { AppError, ErrorCode } from '@lemonade/core';
import { createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { diagnosticJobStore } from '@/application/jobs/DiagnosticJobStore';
import { verifyApiKey } from '@/infrastructure/auth/verifyApiKey';

export const dynamic = 'force-dynamic';

type JobRouteContext = {
    params: {
        jobId: string;
    };
};

/** GET /api/jobs/[jobId]: the job plus every event it has emitted so far. */
export const GET = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as JobRouteContext;
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        const job = diagnosticJobStore.get(params.jobId);
        if (!job) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Job ${params.jobId} not found.`);
        return NextResponse.json({ job, events: diagnosticJobStore.eventsFor(params.jobId) });
    } catch (error) {
        return createErrorResponse(error);
    }
});

/** DELETE /api/jobs/[jobId]: cancels a live job. */
export const DELETE = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as JobRouteContext;
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        if (!diagnosticJobStore.cancel(params.jobId)) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Job ${params.jobId} not found or already finished.`);
        }
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return createErrorResponse(error);
    }
});
