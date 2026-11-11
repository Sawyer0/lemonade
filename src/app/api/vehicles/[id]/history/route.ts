import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, ErrorCode, IEdgeSecurityService } from '@lemonade/core';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import { VehicleHistoryResponseSchema } from '@/application/dtos/vehicle.dto';
import { validateResponse, createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

/** A vehicle the caller owns and its diagnostic sessions, newest first. */
export const GET = withContext(async (req: Request, context: unknown) => {
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        const { id } = await (context as RouteContext).params;
        const vehicleId = z.string().min(1).parse(id);

        const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
        const vehicle = await vehicleService.getVehicle(vehicleId, auth.userId);
        if (!vehicle) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Vehicle not found', 404);
        }

        const sessions = (await vehicleService.getHistory(vehicleId, auth.userId)).sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

        return NextResponse.json(validateResponse({ data: { vehicle, sessions } }, VehicleHistoryResponseSchema));
    } catch (error) {
        return createErrorResponse(error);
    }
});
