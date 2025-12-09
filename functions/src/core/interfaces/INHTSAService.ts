export interface SafetyRecall {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Conequence: string;
    Remedy: string;
    Notes: string;
}

export interface INHTSAService {
    checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]>;
    validateVin(vin: string): Promise<boolean>;
}
