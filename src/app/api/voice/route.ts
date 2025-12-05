import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IDiagnosticService } from '@/core/interfaces/IDiagnosticService';
import { VoiceRequestSchema } from '@/application/dtos';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: NextRequest) {
    try {
        const { audioData, sessionId } = await validateRequest(req, VoiceRequestSchema);

        // Rehydrate Float32Array from JSON object/array
        const float32Array = new Float32Array(Object.values(audioData));

        const diagnosticService = container.get<IDiagnosticService>(TYPES.DiagnosticService);
        const response = await diagnosticService.processVoiceCommand(sessionId, float32Array);

        return NextResponse.json({ response });

    } catch (error) {
        return createErrorResponse(error);
    }
}
