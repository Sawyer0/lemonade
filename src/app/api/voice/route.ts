import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVoiceService } from '@/core/interfaces/IVoiceService';
import { IServerAuthService } from '@/core/interfaces/IServerAuthService';
import { AppError } from '@/core/errors/AppError';
import { z } from 'zod';

const VoiceRequestSchema = z.object({
    sessionId: z.string().uuid(),
    vehicleContext: z.string().min(1),
    reasoningEffort: z.enum(['low', 'medium', 'high', 'none']).optional()
});

export async function POST(req: Request) {
    try {
        // Double Check Tier (Defense in Depth)
        const tier = req.headers.get('x-user-tier');
        if (tier !== 'pro') {
            return NextResponse.json({ error: 'Upgrade Required' }, { status: 403 });
        }

        // 1. Authenticate
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const authService = container.get<IServerAuthService>(TYPES.ServerAuthService);
        const decodedToken = await authService.verifyToken(token);
        const userId = decodedToken.uid;

        // 2. Parse Form
        const formData = await req.formData();
        const audioFile = formData.get('audio') as Blob;
        const metadataJson = formData.get('metadata') as string;

        if (!audioFile || !metadataJson) {
            return NextResponse.json({ error: 'Missing audio or metadata' }, { status: 400 });
        }

        const metadata = VoiceRequestSchema.parse(JSON.parse(metadataJson));

        // 3. Convert Blob to Buffer (Node.js compatible)
        const mimeType = audioFile.type || 'audio/webm'; // Fallback for safety, but trust client
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 4. Execute Service
        const voiceService = container.get<IVoiceService>(TYPES.VoiceService);

        const responseText = await voiceService.processVoiceCommand(
            buffer,
            mimeType,
            metadata.vehicleContext,
            userId,
            metadata.sessionId,
            metadata.reasoningEffort as any
        );

        return NextResponse.json({
            success: true,
            text: responseText
        });

    } catch (error) {
        console.error('[API/Voice] Error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid metadata format', details: error.errors }, { status: 400 });
        }

        if (error instanceof AppError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
