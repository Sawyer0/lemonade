import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { ISessionService } from '@/core/interfaces/ISessionService';
import { createErrorResponse } from '@/application/utils/validateRequest';

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const sessionId = params.id;
        if (!sessionId) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized: Missing user context' }, { status: 401 });
        }

        const sessionService = container.get<ISessionService>(TYPES.SessionService);
        await sessionService.deleteSession(sessionId, userId);

        return NextResponse.json({ success: true });
    } catch (error) {
        return createErrorResponse(error);
    }
}
