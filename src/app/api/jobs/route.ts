import { NextRequest, NextResponse } from 'next/server';
import { AppError, CreateDiagnosticJobRequestSchema, ErrorCode, ILogger, IMechanicReasoningService } from '@lemonade/core';
import { createErrorResponse, validateRequest } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { diagnosticJobStore } from '@/application/jobs/DiagnosticJobStore';
import { runDiagnosticJob } from '@/application/jobs/DiagnosticJobRunner';
import { verifyApiKey } from '@/infrastructure/auth/verifyApiKey';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic job tickets (LM-14). The LiveKit talker files jobs here; the
 * reasoner runs in the background and streams events back over SSE.
 * Agent-only: the worker authenticates with X-API-KEY (see verifyApiKey).
 */
export const POST = withContext(async (req: NextRequest) => {
    const logger = container.get<ILogger>(TYPES.Logger);
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        const request = await validateRequest(req, CreateDiagnosticJobRequestSchema);
        const job = diagnosticJobStore.create(request);
        logger.info('Diagnostic job created', { jobId: job.id, caseId: job.caseId });
        // The reasoner runs in the background; the 202 already carries the job id.
        void runDiagnosticJob(
            {
                store: diagnosticJobStore,
                reasoner: container.get<IMechanicReasoningService>(TYPES.MechanicReasoningService),
                logger,
            },
            job,
            request,
        );
        return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
    } catch (error) {
        return createErrorResponse(error);
    }
});

export const GET = withContext(async (req: NextRequest) => {
    try {
        const apiKeyValidationResponse = verifyApiKey(req);
        if (apiKeyValidationResponse) return apiKeyValidationResponse;

        const { searchParams } = new URL(req.url);
        const caseId = searchParams.get('caseId');
        if (!caseId || !z.string().uuid().safeParse(caseId).success) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'A valid caseId query parameter is required.');
        }
        return NextResponse.json(diagnosticJobStore.listByCase(caseId));
    } catch (error) {
        return createErrorResponse(error);
    }
});
