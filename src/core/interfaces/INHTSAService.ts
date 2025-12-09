export interface SafetyRecall {
    ReportReceivedDate: string;
    Component: string;
    Summary: string;
    Conequence: string;
    Remedy: string;
    Notes: string;
}

export interface INHTSAService {
    /**
     * Node 3: Deterministic Grounding
     * Queries the NHTSA API for active recalls for a specific vehicle.
     * @param year Vehicle Year
     * @param make Vehicle Make
     * @param model Vehicle Model
     */
    checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]>;

    /**
     * Validates a VIN and returns basic vehicle info if valid.
     */
    validateVin(vin: string): Promise<boolean>;
}
