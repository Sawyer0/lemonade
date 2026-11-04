import { INHTSAService, SafetyRecall, ILogger, SafetyRecallSchema } from '@lemonade/core';
import { TYPES } from '../di/types';
import { injectable, inject } from 'inversify';

@injectable()
export class NHTSAService implements INHTSAService {
    private readonly BASE_URL = 'https://api.nhtsa.gov';

    constructor(@inject(TYPES.Logger) private logger: ILogger) {}

    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return data.results.map((r: any) => {
                    // Use parse to validate and transform, allowing Zod to catch issues
                    return SafetyRecallSchema.parse({
                        ReportReceivedDate: r.ReportReceivedDate,
                        Component: r.Component,
                        Summary: r.Summary,
                        Consequence: r.Consequence || r.Conequence, // Handle potential API typo or mapping
                        Remedy: r.Remedy,
                        Notes: r.Notes,
                        NHTSACampaignNumber: r.NHTSACampaignNumber, // Added optional fields
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
            const url = `${this.BASE_URL}/vehicles/DecodeVin/${encodeURIComponent(vin)}?format=json`;
            const response = await fetch(url);

            if (!response.ok) return false;

            const data = await response.json();

            if (data.Results && Array.isArray(data.Results)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const make = data.Results.find((r: any) => r.VariableId === 26 || r.Variable === 'Make')?.Value;
                return !!make;
            }
            return false;
        } catch (error) {
            this.logger.error('[NHTSAService] VIN validation failed', error);
            return false;
        }
    }
}
