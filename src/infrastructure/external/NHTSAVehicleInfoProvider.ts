import { injectable, inject } from 'inversify';
import type { ILogger } from '@lemonade/core';
import { IVehicleInfoProvider, VehicleSpecs, AppError, ErrorCode } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

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
            
            const getVal = (key: string) => {
                const item = results.find((r) => r.Variable === key);
                return item && item.Value ? item.Value : "Unknown";
            };

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
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, "Could not verify vehicle identity. Please try again.");
        }
    }
}