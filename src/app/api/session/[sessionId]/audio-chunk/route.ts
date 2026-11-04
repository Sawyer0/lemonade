import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@lemonade/infrastructure';
import { AppError, ErrorCode, ILiveStreamAnalyzer, DiagnosticSessionSchema, ILogger } from '@lemonade/core';
import { createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { AudioChunkRequestSchema, AudioChunkResponseDTO } from '@/application/dtos/audio.dto';
import { verifyApiKey } from '@/app/api/utils/auth';

type AudioChunkRouteContext = {
    params: {
        sessionId: string;
    };
};

export const POST = withContext(async (req: NextRequest, context: unknown) => {
    const { params } = context as AudioChunkRouteContext;
    const logger = container.get<ILogger>(TYPES.Logger);
    const { sessionId } = params;

    try {
        const body = await req.json(); // Read body ONCE

        // --- Authentication ---
        const apiKeyValidationResponse = verifyApiKey(req);
        let userId: string;

        if (req.headers.has('X-API-KEY')) {
            // API Key Authentication (Agent)
            if (apiKeyValidationResponse) return apiKeyValidationResponse; // Invalid API Key

            userId = body.userId;
            if (!userId) {
                throw new AppError(
                    ErrorCode.MISSING_REQUIRED_PARAMETERS,
                    'userId is required in the body for API Key authenticated requests.',
                );
            }
        } else {
            // Firebase Token Authentication (User)
            const authHeader = req.headers.get('Authorization');
            if (!authHeader?.startsWith('Bearer ')) {
                throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Authorization token for user authentication.');
            }
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await adminAuth.verifyIdToken(token);
            userId = decodedToken.uid;
        }
        // --- End Authentication ---

        // 2. Validate Input using the already read body
        const { audioData, mimeType, chunkDurationSeconds, audioTimestamp, vehicleContext } =
            AudioChunkRequestSchema.parse(body);

        // Optional: Further validate vehicleContext if needed, e.g., against DiagnosticSession's vehicle
        const parsedContext = JSON.parse(vehicleContext);
        const sanitizedVehicleContext = DiagnosticSessionSchema.pick({ vehicleId: true }).safeParse(parsedContext)
            .success
            ? vehicleContext
            : '{}';
        const vin = parsedContext?.vin;

        // 3. Call Live Stream Analyzer
        const liveStreamAI = container.get<ILiveStreamAnalyzer>(TYPES.LiveStreamAI);

        const analysis = await liveStreamAI.analyzeLiveAudioChunk(
            audioData,
            mimeType,
            sanitizedVehicleContext,
            userId,
            sessionId,
            chunkDurationSeconds,
            typeof vin === 'string' ? vin : undefined,
            audioTimestamp,
        );

        if (analysis === null) {
            // This indicates a rate-limiting rejection, client should wait.
            return NextResponse.json(
                {
                    analysis: null,
                    message: 'Audio chunk rate limit exceeded. Please wait.',
                } satisfies AudioChunkResponseDTO,
                { status: 429 }, // 429 Too Many Requests
            );
        }

        // 4. Return AI Analysis
        return NextResponse.json({ analysis: analysis } satisfies AudioChunkResponseDTO);
    } catch (error) {
        logger.error(`API Error in POST /api/session/${sessionId}/audio-chunk`, error);
        return createErrorResponse(error);
    }
});
