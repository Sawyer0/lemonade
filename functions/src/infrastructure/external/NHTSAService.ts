import { injectable } from 'inversify';
import { INHTSAService, SafetyRecall } from '../../core/interfaces/INHTSAService';

@injectable()
export class NHTSAService implements INHTSAService {
    private readonly BASE_URL = 'https://api.nhtsa.gov';

    async checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]> {
        try {
            // NHTSA API Format: /recalls/recallsByVehicle?make=ford&model=f-150&year=2018
            const url = `${this.BASE_URL}/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                console.error(`[NHTSAService] API Error: ${response.statusText}`);
                return []; 
            }

            const data = await response.json();

            if (data.Count > 0 && Array.isArray(data.results)) {
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
            console.error('[NHTSAService] Failed to fetch recalls', error);
            return [];
        }
    }

    async validateVin(vin: string): Promise<boolean> {
        return true; // Stub for now
    }
}
