import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { Vehicle } from '@/core/types/models';
import { v4 as uuidv4 } from 'uuid';

import type { ILogger } from '@/core/interfaces/ILogger';

@injectable()
export class VehicleService {
    constructor(
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async onboardVehicle(vin: string, userId: string): Promise<Vehicle> {
        // 1. Check if vehicle already exists for this user
        const existing = await this.vehicleRepo.findByUser(userId);
        const duplicate = existing.find(v => v.vin === vin);
        if (duplicate) return duplicate;

        // 2. Fetch DNA from NHTSA 
        const specs = await this.fetchNHTSADetails(vin);

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

    private async fetchNHTSADetails(vin: string) {
        try {
            const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
            if (!response.ok) throw new Error("Failed to connect to NHTSA API");

            const data = await response.json();
            const results = data.Results || [];

            // Helper to find value by Variable key safely
            const getVal = (key: string) => {
                const item = results.find((r: any) => r.Variable === key);
                return item && item.Value ? item.Value : "Unknown";
            };

            // Extract critical DNA
            const year = parseInt(getVal("Model Year")) || new Date().getFullYear();
            const make = getVal("Make");
            const model = getVal("Model");
            const displacement = getVal("Displacement (L)");
            const config = getVal("Engine Configuration");
            const fuel = getVal("Fuel Type - Primary");
            const trim = getVal("Trim");

            return {
                year,
                make,
                model,
                engine: displacement !== "Unknown" ? `${displacement}L ${config} ${fuel}` : "Unknown Engine",
                trim: trim !== "Unknown" ? trim : undefined,
            };
        } catch (error) {
            this.logger.error("NHTSA API Error", error, { vin });
            // Fallback for MVP if API fails, but still structured
            throw new Error("Could not verify vehicle identity. Please try again.");
        }
    }
}
