import { NextRequest } from 'next/server';
import { AppError, ErrorCode } from '@lemonade/core';
import { createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { diagnosticJobStore } from '@/application/jobs/DiagnosticJobStore';
import { createJobEventStream } from '@/application/jobs/jobEventStream';
import { verifyApiKey } from '@/infrastructure/auth/verifyApiKey';

export const dynamic = 'force-dynamic';

type JobRouteContext = {
    params: {
        jobId: string;
    };
};

/**
 * GET /api/jobs/[jobId]/events: SSE stream of a job's events. Stored events
 * replay first, then live ones; the stream closes after the terminal event.
 */
export const GET = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as JobRouteContext;
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        if (!diagnosticJobStore.get(params.jobId)) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Job ${params.jobId} not found.`);
        }
        return new Response(createJobEventStream(diagnosticJobStore, params.jobId), {
            headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
            },
        });
    } catch (error) {
        return createErrorResponse(error);
    }
});
