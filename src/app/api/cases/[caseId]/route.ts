import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import type { ICaseService } from '@lemonade/core';
import { AppError, ErrorCode } from '@lemonade/core';
import { createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { type CaseDetailsResponseDTO } from '@/application/dtos/case.dto';
import { z } from 'zod';

type CaseRouteContext = {
    params: {
        caseId: string;
    };
};

export const GET = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as CaseRouteContext;

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

        return NextResponse.json({
            data: { case: caseRecord, entries },
        } satisfies CaseDetailsResponseDTO);
    } catch (error) {
        return createErrorResponse(error);
    }
});
