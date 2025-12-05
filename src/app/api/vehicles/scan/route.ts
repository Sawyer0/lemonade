import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import { ILogger } from '@/core/interfaces/ILogger';
import { VehicleScanRequestSchema } from '@/application/dtos';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
  try {
    const { vin, userId } = await validateRequest(req, VehicleScanRequestSchema);

    const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
    const vehicle = await vehicleService.onboardVehicle(vin, userId);

    return NextResponse.json({
      success: true,
      data: vehicle,
    });

  } catch (error) {
    return createErrorResponse(error);
  }
}
