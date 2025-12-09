import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VideoAnalysisService } from '@/application/services/VideoAnalysisService';
import { ILogger } from '@/core/interfaces/ILogger';
import { AnalysisTriggerRequestSchema, AnalysisTriggerResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
    try {
        // Double Check Tier (Defense in Depth)
        const tier = req.headers.get('x-user-tier');
        if (tier !== 'pro') {
            return NextResponse.json({ error: 'Upgrade Required' }, { status: 403 });
        }

        const { sessionId, publicUrl } = await validateRequest(req, AnalysisTriggerRequestSchema);

        const videoAnalysisService = container.get<VideoAnalysisService>(TYPES.VideoAnalysisService);

        // Fire and Forget
        videoAnalysisService.processVideoUpload(sessionId, publicUrl).catch(err => {
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