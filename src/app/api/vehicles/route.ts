import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVehicleRepository, IEdgeSecurityService } from '@lemonade/core';
import { VehicleListResponseSchema } from '@/application/dtos/vehicle.dto';
import { validateQueryParams, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

const VehicleListRequestSchema = z.object({
    userId: z.string().min(1),
});

export const GET = withContext(async (req: Request) => {
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    try {
        const { userId } = validateQueryParams(req, VehicleListRequestSchema);

        const auth = await security.getAuthenticatedUser(req);
        if (!auth || auth.userId !== userId) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass or invalid identity' }, { status: 403 });
        }

        const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo);
        const vehicles = await vehicleRepo.findByUser(userId);

        const responseData = { data: vehicles };
        const validatedResponse = validateResponse(responseData, VehicleListResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
});


