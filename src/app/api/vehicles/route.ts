import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    try {
        const vehicleRepo = container.get<IVehicleRepository>(TYPES.VehicleRepo);
        const vehicles = await vehicleRepo.findByUser(userId);

        return NextResponse.json({ data: vehicles });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
    }
}
