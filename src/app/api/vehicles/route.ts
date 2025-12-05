import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { VehicleListResponseSchema } from '@/application/dtos/vehicle.dto';
import { validateQueryParams, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

const VehicleListRequestSchema = z.object({
    userId: z.string().min(1),
});

export async function GET(req: Request) {
    try {
        const { userId } = validateQueryParams(req, VehicleListRequestSchema);

        const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo);
        const vehicles = await vehicleRepo.findByUser(userId);

        const responseData = { data: vehicles };
        const validatedResponse = validateResponse(responseData, VehicleListResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
}
