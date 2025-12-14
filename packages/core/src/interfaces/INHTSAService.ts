import { SafetyRecall } from '../types/models';

export interface INHTSAService {
    /**
     * @param year Vehicle Year
     * @param make Vehicle Make
     * @param model Vehicle Model
     */
    checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]>;

    validateVin(vin: string): Promise<boolean>;
}
