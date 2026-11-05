import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVehicleRepository, IEdgeSecurityService } from '@lemonade/core';
import { VehicleListResponseSchema } from '@/application/dtos/vehicle.dto';
import { validateQueryParams, validateResponse, createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';

/** `userId` is optional and only kept for older clients; the owner always comes from the ID token. */
const VehicleListRequestSchema = z.object({
    userId: z.string().min(1).optional(),
});

export const GET = withContext(async (req: Request) => {
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        const { userId } = validateQueryParams(req, VehicleListRequestSchema);
        if (userId !== undefined && userId !== auth.userId) {
            return NextResponse.json({ error: "Forbidden: cannot read another user's garage" }, { status: 403 });
        }

        const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo);
        const vehicles = await vehicleRepo.findByUser(auth.userId);

        const validatedResponse = validateResponse({ data: vehicles }, VehicleListResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
});
