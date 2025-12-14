import { injectable, inject } from 'inversify';
import type { ILogger } from '@lemonade/core';
import { INHTSAService, SafetyRecall, SafetyRecallSchema } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class NHTSAService implements INHTSAService {
    private readonly BASE_URL = 'https://api.nhtsa.gov';

    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        this.logger.info(`[NHTSAService] Checking recalls for ${year} ${make} ${model}`);

        try {
            // NHTSA API Format: /recalls/recallsByVehicle?make=ford&model=f-150&year=2018
            const url = `${this.BASE_URL}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;

            const response = await fetch(url);

            if (!response.ok) {
                this.logger.error(`[NHTSAService] API Error: ${response.statusText}`);
                return [];
            }

            const data = await response.json();

            if (data.Count > 0 && Array.isArray(data.results)) {
                this.logger.info(`[NHTSAService] Found ${data.Count} recalls`);
                return data.results.map((r: any) => {
                    return SafetyRecallSchema.parse({
                        ReportReceivedDate: r.ReportReceivedDate,
                        Component: r.Component,
                        Summary: r.Summary,
                        Consequence: r.Consequence,
                        Remedy: r.Remedy,
                        Notes: r.Notes,
                        NHTSACampaignNumber: r.NHTSACampaignNumber,
                        Manufacturer: r.Manufacturer,
                        parkIt: r.parkIt,
                        parkOutSide: r.parkOutSide,
                        overTheAirUpdate: r.overTheAirUpdate,
                        NHTSAActionNumber: r.NHTSAActionNumber,
                        ModelYear: r.ModelYear,
                        Make: r.Make,
                        Model: r.Model,
                    });
                });
            }

            return [];
        } catch (error) {
            this.logger.error('[NHTSAService] Failed to fetch recalls', error);
            return [];
        }
    }

    async validateVin(vin: string): Promise<boolean> {
        try {
            const url = `${this.BASE_URL}/vehicles/DecodeVin/${vin}?format=json`;
            const response = await fetch(url);
            if (!response.ok) return false;

            const data = await response.json();
            return data.Results && data.Results.length > 0 && data.Results[0].ErrorCode === "0";
        } catch (error) {
            this.logger.error('[NHTSAService] VIN check failed', error);
            return false;
        }
    }
}