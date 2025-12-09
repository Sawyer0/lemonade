import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { SessionService } from '@/application/services/SessionService';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const vehicleId = searchParams.get('vehicleId');

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
    }

    try {
        console.log(`DEBUG: Starting session for vehicleId: ${vehicleId}`);
        const sessionService = container.get<SessionService>(TYPES.SessionService);
        const sessionId = await sessionService.startSession(vehicleId);
        console.log(`DEBUG: Session started with ID: ${sessionId}`);

        // Redirect to the session page
        return NextResponse.redirect(new URL(`/session/${sessionId}`, req.url));
    } catch (error) {
        console.error('Failed to start session:', error);
        return NextResponse.json({ error: 'Failed to start session', details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
