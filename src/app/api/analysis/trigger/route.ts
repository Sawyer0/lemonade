import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticService } from '@/application/services/DiagnosticService';
import { ILogger } from '@/core/interfaces/ILogger';
import { AnalysisTriggerRequestSchema, AnalysisTriggerResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
    try {
        const { sessionId, publicUrl } = await validateRequest(req, AnalysisTriggerRequestSchema);

        const diagnosticService = container.get<DiagnosticService>(TYPES.DiagnosticService);

        // Fire and Forget
        diagnosticService.processVideoUpload(sessionId, publicUrl).catch(err => {
            const logger = container.get<ILogger>(TYPES.Logger);
            logger.error(`[Background Job Failed] Session: ${sessionId}`, err);
        });

        const responseData = {
            status: 'processing_started' as const,
            message: 'The Master Tech is analyzing your video.'
        };

        const validatedResponse = validateResponse(responseData, AnalysisTriggerResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
}
