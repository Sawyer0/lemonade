import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVehicleRepository } from '@lemonade/core';
import { VehicleListResponseSchema } from '@/application/dtos/vehicle.dto';
import { validateQueryParams, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

const VehicleListRequestSchema = z.object({
    userId: z.string().min(1),
});

export const GET = withContext(async (req: Request) => {
    try {
        const { userId } = validateQueryParams(req, VehicleListRequestSchema);

        const authUserId = req.headers.get('x-user-id');
        if (!authUserId || authUserId !== userId) {
            return NextResponse.json({ error: 'Unauthorized: You can only view your own vehicles' }, { status: 403 });
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


