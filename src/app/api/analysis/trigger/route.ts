import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VideoAnalysisService } from '@/application/services/VideoAnalysisService';
import { ILogger, ISessionRepository, IEdgeSecurityService } from '@lemonade/core';
import { AnalysisTriggerRequestSchema, AnalysisTriggerResponseSchema } from '@/application/dtos';
import { validateResponse, createErrorResponse } from '@/application/utils/validateRequest';
import { Storage } from '@google-cloud/storage';
import { z } from 'zod';
import { withContext } from '@/application/utils/apiHandler';

const storage = new Storage();
const GCS_MEDIA_BUCKET = process.env.GCLOUD_MEDIA_BUCKET || 'your-gcs-media-bucket';

export const POST = withContext(async (req: Request) => {
    const logger = container.get<ILogger>(TYPES.Logger);
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    logger.info(`Analysis Trigger Request Started`, { path: req.url });

    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        if (auth.tier !== 'pro') {
            logger.warn(`Access Denied: Pro tier required for analysis trigger.`, { tier: auth.tier });
            return NextResponse.json({ error: 'Upgrade Required', code: 'PRO_REQUIRED' }, { status: 403 });
        }

        const authUserId = auth.userId;
        const requestBody = await req.json();

        const extendedSchema = AnalysisTriggerRequestSchema.extend({
            imageData: z.string().optional(),
            detectionMeta: z.unknown().optional(),
            vehicleContext: z.string().optional(),
        });
        const validatedInput = extendedSchema.parse(requestBody);
        const { sessionId, publicUrl } = validatedInput;

        // --- Security Check: Ownership ---
        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const session = await sessionRepo.findById(sessionId);

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.userId !== authUserId) {
            logger.warn(`Unauthorized analysis attempt`, { sessionId, authUserId, ownerId: session.userId });
            return NextResponse.json({ error: 'Unauthorized: You do not own this session' }, { status: 403 });
        }

        let finalPublicUrl = publicUrl;

        if (validatedInput.imageData) {
            logger.info(`Received image data, uploading to GCS...`, { sessionId });
            const base64Data = validatedInput.imageData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            const fileName = `sessions/${sessionId}/snapshot-${Date.now()}.jpeg`;
            const file = storage.bucket(GCS_MEDIA_BUCKET).file(fileName);

            await file.save(buffer, {
                contentType: 'image/jpeg',
            });
            finalPublicUrl = `gs://${GCS_MEDIA_BUCKET}/${fileName}`;
            logger.info(`Snapshot uploaded to GCS: ${finalPublicUrl}`, { sessionId });
        } else if (!finalPublicUrl) {
            logger.warn(`Missing publicUrl or imageData in analysis trigger.`, { sessionId });
            return NextResponse.json({ error: 'Missing publicUrl or imageData' }, { status: 400 });
        }


        const videoAnalysisService = container.get<VideoAnalysisService>(TYPES.VideoAnalysisService);

        // Fire and Forget - processVideoUpload signature is (sessionId, videoUrl, videoDurationMinutes?)
        videoAnalysisService.processVideoUpload(sessionId, finalPublicUrl).catch(err => {
            logger.error(`[Background Job Failed] Session: ${sessionId}`, err, { sessionId });
        });

        const responseData = {
            status: 'processing_started' as const,
            message: 'The Master Tech is analyzing your image/video.'
        };

        const validatedResponse = validateResponse(responseData, AnalysisTriggerResponseSchema);
        logger.info(`Analysis trigger successful.`, { sessionId, finalPublicUrl });
        return NextResponse.json(validatedResponse);
    } catch (error) {
        logger.error(`Analysis Trigger Failed`, error);
        return createErrorResponse(error);
    }
});