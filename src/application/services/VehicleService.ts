import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IVehicleRepository, ISessionRepository, IVehicleInfoProvider, ILogger } from '@lemonade/core';
import { Vehicle, DiagnosticSession } from '@lemonade/core';
import { v4 as uuidv4 } from 'uuid';

@injectable()
export class VehicleService {
    constructor(
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleInfoProvider) private vehicleInfoProvider: IVehicleInfoProvider,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    async onboardVehicle(vin: string, userId: string): Promise<Vehicle> {
        const existing = await this.vehicleRepo.findByUser(userId);
        const duplicate = existing.find((v) => v.vin === vin);
        if (duplicate) return duplicate;

        const specs = await this.vehicleInfoProvider.getVehicleSpecs(vin);

        const newVehicle: Vehicle = {
            id: uuidv4(),
            vin,
            userId,
            specs,
            activeIssuesCount: 0,
            createdAt: new Date(),
        };

        await this.vehicleRepo.create(newVehicle);

        return newVehicle;
    }

    async getVehicle(id: string, userId: string): Promise<Vehicle | null> {
        return this.vehicleRepo.findById(id, userId);
    }

    /** Sessions for a vehicle, limited to the ones the user owns. */
    async getHistory(vehicleId: string, userId: string): Promise<DiagnosticSession[]> {
        const sessions = await this.sessionRepo.findByVehicleId(vehicleId);
        return sessions.filter((session) => session.userId === userId);
    }
}
