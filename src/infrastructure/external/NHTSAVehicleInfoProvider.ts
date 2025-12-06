import { injectable, inject } from 'inversify';
import { IVehicleInfoProvider, VehicleSpecs } from '@/core/interfaces/IVehicleInfoProvider';
import { TYPES } from '@/infrastructure/di/types';
import type { ILogger } from '@/core/interfaces/ILogger';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

@injectable()
export class NHTSAVehicleInfoProvider implements IVehicleInfoProvider {
    constructor(
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async getVehicleSpecs(vin: string): Promise<VehicleSpecs> {
        try {
            const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`);
            if (!response.ok) throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, "Failed to connect to NHTSA API");

            const data = await response.json();

            interface NHTSAResult {
                Variable: string;
                Value: string | null;
            }

            const results = (data.Results || []) as NHTSAResult[];

            // Helper to find value by Variable key safely
            const getVal = (key: string) => {
                const item = results.find((r) => r.Variable === key);
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
            this.logger.error("NHTSA API Error", error instanceof Error ? error : new Error(String(error)), { vin });
            // Fallback for MVP if API fails, but still structured
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, "Could not verify vehicle identity. Please try again.");
        }
    }
}
