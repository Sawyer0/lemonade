import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticService } from '@/application/services/DiagnosticService';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const vehicleId = searchParams.get('vehicleId');

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
    }

    try {
        const diagnosticService = container.get<DiagnosticService>(TYPES.DiagnosticService);
        const sessionId = await diagnosticService.startSession(vehicleId);

        // Redirect to the session page
        return NextResponse.redirect(new URL(`/session/${sessionId}`, req.url));
    } catch (error) {
        console.error('Failed to start session:', error);
        return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
    }
}
