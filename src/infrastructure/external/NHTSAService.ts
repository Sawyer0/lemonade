import { injectable, inject } from 'inversify';
import type { INHTSAService, SafetyRecall } from '@/core/interfaces/INHTSAService';
import { TYPES } from '@/infrastructure/di/types';
import type { ILogger } from '@/core/interfaces/ILogger';

@injectable()
export class NHTSAService implements INHTSAService {
    private readonly BASE_URL = 'https://api.nhtsa.gov';

    constructor(@inject(TYPES.Logger) private logger: ILogger) { }

    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        this.logger.info(`[NHTSAService] Checking recalls for ${year} ${make} ${model}`);

        try {
            // NHTSA API Format: /recalls/recallsByVehicle?make=ford&model=f-150&year=2018
            const url = `${this.BASE_URL}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`;

            const response = await fetch(url);

            if (!response.ok) {
                this.logger.error(`[NHTSAService] API Error: ${response.statusText}`);
                return []; // Fail safe, don't crash
            }

            const data = await response.json();

            if (data.Count > 0 && Array.isArray(data.results)) {
                this.logger.info(`[NHTSAService] Found ${data.Count} recalls`);
                return data.results.map((r: any) => ({
                    ReportReceivedDate: r.ReportReceivedDate,
                    Component: r.Component,
                    Summary: r.Summary,
                    Conequence: r.Conequence,
                    Remedy: r.Remedy,
                    Notes: r.Notes
                }));
            }

            return [];
        } catch (error) {
            this.logger.error('[NHTSAService] Failed to fetch recalls', error);
            // In a strict safety system, we might want to throw, 
            // but for "Node 3" check we typically return empty and let the system proceed 
            // unless strictness is required. For now, proceeding with empty to avoid blocking functionality on network glitch.
            return [];
        }
    }

    async validateVin(vin: string): Promise<boolean> {
        // Implementation for VIN validation if needed later
        try {
            const url = `${this.BASE_URL}/vin/${vin}?format=json`;
            const response = await fetch(url);
            if (!response.ok) return false;
            const data = await response.json();
            return data.Results && data.Results.length > 0; // simplified check
        } catch (error) {
            this.logger.error('[NHTSAService] VIN check failed', error);
            return false;
        }
    }
}
