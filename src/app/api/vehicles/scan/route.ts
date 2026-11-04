import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import { ILogger } from '@lemonade/core';
import { VehicleScanRequestSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/http/validateRequest';
import { VehicleScanResponseSchema } from '@/application/dtos/vehicle.dto';
import { withContext } from '@/application/http/withContext';

export const POST = withContext(async (req: Request) => {
    try {
        const { vin, userId } = await validateRequest(req, VehicleScanRequestSchema);

        const authUserId = req.headers.get('x-user-id');
        if (!authUserId || authUserId !== userId) {
            return NextResponse.json(
                { error: 'Unauthorized: You can only add vehicles to your own garage' },
                { status: 403 },
            );
        }

        const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
        const logger = container.get<ILogger>(TYPES.Logger);

        logger.info('Vehicle scan initiated', { vin: vin.slice(-4), userId });
        const vehicle = await vehicleService.onboardVehicle(vin, userId);
        logger.info('Vehicle onboarded successfully', { vehicleId: vehicle.id });

        const responseProps = {
            success: true,
            data: vehicle,
        };

        const validatedResponse = validateResponse(responseProps, VehicleScanResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
});
