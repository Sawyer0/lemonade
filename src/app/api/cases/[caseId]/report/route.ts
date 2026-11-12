import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import type { ICaseService } from '@lemonade/core';
import { AppError, buildCaseReport, ErrorCode } from '@lemonade/core';
import { createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { type CaseReportResponseDTO } from '@/application/dtos/case.dto';
import { z } from 'zod';

type ReportRouteContext = {
    params: {
        caseId: string;
    };
};

// LM-06: the one-page case report, built server-side straight from the
// ledger so the page never has to re-prove the citations. The report is
// plain JSON; the page renders it, and the browser's print dialog saves it
// as PDF — no PDF library, no extra dependency.
export const GET = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as ReportRouteContext;

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing token');
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        const { caseId } = params;
        const validatedCaseId = z.string().uuid().parse(caseId);

        const caseService = container.get<ICaseService>(TYPES.CaseService);
        const { caseRecord, entries } = await caseService.getCase(validatedCaseId, userId);
        const report = buildCaseReport({ caseRecord, entries, generatedAt: new Date() });

        return NextResponse.json({ data: report } satisfies CaseReportResponseDTO);
    } catch (error) {
        return createErrorResponse(error);
    }
});
