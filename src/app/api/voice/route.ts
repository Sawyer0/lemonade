import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVoiceService } from '@/core/interfaces/IVoiceService';
import { VoiceRequestSchema, VoiceResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: NextRequest) {
    try {
        const { audioData, sessionId } = await validateRequest(req, VoiceRequestSchema);

        // Rehydrate Float32Array from JSON object/array
        const float32Array = new Float32Array(Object.values(audioData));

        const voiceService = container.get<IVoiceService>(TYPES.VoiceService);
        const response = await voiceService.processVoiceCommand(sessionId, float32Array);

        const responseData = { response };
        const validatedResponse = validateResponse(responseData, VoiceResponseSchema);

        return NextResponse.json(validatedResponse);

    } catch (error) {
        return createErrorResponse(error);
    }
}
