import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticService } from '@/application/services/DiagnosticService';
import { ILogger } from '@/core/interfaces/ILogger';

export async function POST(req: Request) {
    const { sessionId, publicUrl } = await req.json();

    const diagnosticService = container.get<DiagnosticService>(TYPES.DiagnosticService);

    // Fire and Forget
    diagnosticService.processVideoUpload(sessionId, publicUrl).catch(err => {
        const logger = container.get<ILogger>(TYPES.Logger);
        logger.error(`[Background Job Failed] Session: ${sessionId}`, err);
    });

    return NextResponse.json({
        status: 'processing_started',
        message: 'The Master Tech is analyzing your video.'
    });
}
