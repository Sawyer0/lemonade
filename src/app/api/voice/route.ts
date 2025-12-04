import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IDiagnosticService } from '@/core/interfaces/IDiagnosticService';
import { AppError, ErrorCode } from '@/core/errors';
import { ILogger } from '@/core/interfaces/ILogger';

export async function POST(req: NextRequest) {
    try {
        const { audioData, sessionId } = await req.json();

        if (!audioData || !sessionId) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'Missing audio data or session ID', 400);
        }

        // Rehydrate Float32Array from JSON object/array
        const float32Array = new Float32Array(Object.values(audioData));

        const diagnosticService = container.get<IDiagnosticService>(TYPES.DiagnosticService);
        const response = await diagnosticService.processVoiceCommand(sessionId, float32Array);

        return NextResponse.json({ response });

    } catch (error) {
        const logger = container.get<ILogger>(TYPES.Logger);
        logger.error('Voice API Error', error);

        const appError = AppError.fromError(error);
        return NextResponse.json(
            { error: appError.message, code: appError.code },
            { status: appError.statusCode }
        );
    }
}
