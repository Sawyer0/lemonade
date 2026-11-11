import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { ILogger, IVehicleRepository, AppError } from '@lemonade/core';
import { SessionService } from '@/application/services/SessionService';
import { withContext } from '@/application/http/withContext';

export const GET = withContext(async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const vehicleId = searchParams.get('vehicleId');
    // Optional: start the session attached to an existing case.
    const caseId = searchParams.get('caseId');

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID is required' }, { status: 400 });
    }

    // traceId is now automatically handled by RequestContext

    try {
        const userId = req.headers.get('x-user-id');
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const logger = container.get<ILogger>(TYPES.Logger);

        // --- Security Check: Ownership ---
        const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo);
        const vehicle = await vehicleRepo.findById(vehicleId, userId);

        if (!vehicle) {
            return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
        }

        if (vehicle.userId !== userId) {
            logger.warn(`Unauthorized session start attempt`, { vehicleId, userId, ownerId: vehicle.userId });
            return NextResponse.json({ error: 'Unauthorized: You do not own this vehicle' }, { status: 403 });
        }

        logger.info(`Starting session`, { vehicleId, userId });
        const sessionService = container.get<SessionService>(TYPES.SessionService);
        const sessionId = await sessionService.startSession(vehicleId, userId, caseId ?? undefined);
        logger.info(`Session started`, { sessionId });

        // Redirect to the session page
        return NextResponse.redirect(new URL(`/session/${sessionId}`, req.url));
    } catch (error) {
        // Domain errors (unknown case, malformed caseId) keep their status;
        // anything else is a 500.
        if (error instanceof AppError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
        }
        // Robust fallback: Attempt to use DI logger, degrade to console if critical infrastructure fails
        try {
            const logger = container.get<ILogger>(TYPES.Logger);
            logger.error('Failed to start session', error as Error);
        } catch (diError: unknown) {
            // Last resort: If the logging subsystem itself is down, use safe console output
            console.error(
                JSON.stringify({
                    level: 'FATAL',
                    message: 'DI Container failed to resolve Logger during exception handling',
                    originalError: error instanceof Error ? error.message : String(error),
                    diError: diError instanceof Error ? diError.message : String(diError),
                }),
            );
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
