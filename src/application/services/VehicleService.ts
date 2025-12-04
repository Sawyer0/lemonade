import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleInfoProvider } from '@/core/interfaces/IVehicleInfoProvider';
import { Vehicle } from '@/core/entities/Vehicle';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { v4 as uuidv4 } from 'uuid';

import type { ILogger } from '@/core/interfaces/ILogger';

@injectable()
export class VehicleService {
    constructor(
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleInfoProvider) private vehicleInfoProvider: IVehicleInfoProvider,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async onboardVehicle(vin: string, userId: string): Promise<Vehicle> {
        // 1. Check if vehicle already exists for this user
        const existing = await this.vehicleRepo.findByUser(userId);
        const duplicate = existing.find(v => v.vin === vin);
        if (duplicate) return duplicate;

        // 2. Fetch DNA from NHTSA 
        const specs = await this.vehicleInfoProvider.getVehicleSpecs(vin);

        // 3. Create Entity
        const newVehicle: Vehicle = {
            id: uuidv4(),
            vin,
            userId,
            specs,
            activeIssuesCount: 0,
            createdAt: new Date()
        };

        // 4. Save to Repo
        await this.vehicleRepo.create(newVehicle);

        return newVehicle;
    }


    async getHistory(vehicleId: string): Promise<DiagnosticSession[]> {
        return this.sessionRepo.findByVehicleId(vehicleId);
    }
}
