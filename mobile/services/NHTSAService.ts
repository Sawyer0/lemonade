import { MobileLogger } from './MobileLogger';

const NHTSA_BASE_URL = 'https://api.nhtsa.gov';

export type Recall = {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Conequence: string;
    Remedy: string;
    Notes: string;
    RecallNumber: string;
};

interface NhtsaRawResult {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Consequence: string;
    Remedy: string;
    Notes: string;
    NHTSACampaignNumber: string;
}

export class NHTSAService {
    private logger: MobileLogger;

    constructor() {
        this.logger = new MobileLogger();
    }

    async getRecallsByVehicle(year: number, make: string, model: string): Promise<Recall[]> {
        try {
            const url = `${NHTSA_BASE_URL}/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`NHTSA API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.Count > 0 && Array.isArray(data.results)) {
                return data.results.map((r: NhtsaRawResult) => ({
                    ReportReceivedDate: r.ReportReceivedDate,
                    Component: r.Component,
                    Summary: r.Summary,
                    Conequence: r.Consequence,
                    Remedy: r.Remedy,
                    Notes: r.Notes,
                    RecallNumber: r.NHTSACampaignNumber
                }));
            }

            return [];
        } catch (error) {
            this.logger.error("Failed to fetch NHTSA Recalls", error as Error);
            return [];
        }
    }
}
