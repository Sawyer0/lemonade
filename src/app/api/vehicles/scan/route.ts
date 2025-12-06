import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import { ILogger } from '@/core/interfaces/ILogger';
import { VehicleScanRequestSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';
import { VehicleScanResponseSchema } from '@/application/dtos/vehicle.dto';

export async function POST(req: Request) {
  try {
    const { vin, userId } = await validateRequest(req, VehicleScanRequestSchema);

    const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
    const logger = container.get<ILogger>(TYPES.Logger);

    logger.info('Vehicle scan initiated', { vin: vin.slice(-4), userId });
    const vehicle = await vehicleService.onboardVehicle(vin, userId);
    logger.info('Vehicle onboarded successfully', { vehicleId: vehicle.id });

    const responseProps = {
      success: true,
      data: vehicle,
    };

    // Validate the response before sending
    const validatedResponse = validateResponse(responseProps, VehicleScanResponseSchema);

    return NextResponse.json(validatedResponse);

  } catch (error) {
    return createErrorResponse(error);
  }
}
