import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';

// Input DTO
const ScanRequestSchema = z.object({
  vin: z.string().length(17),
  userId: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { vin, userId } = ScanRequestSchema.parse(body);

    const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
    const vehicle = await vehicleService.onboardVehicle(vin, userId);

    return NextResponse.json({
      success: true,
      data: vehicle,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid VIN format' }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to decode vehicle' }, { status: 500 });
  }
}
