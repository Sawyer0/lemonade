import { SafetyRecall } from '../types/models';

export interface INHTSAService {
    /**
     * @param year Vehicle Year
     * @param make Vehicle Make
     * @param model Vehicle Model
     */
    checkRecalls(year: number, make: string, model: string): Promise<SafetyRecall[]>;

    /**
     * Like checkRecalls, but a failed lookup throws instead of returning an
     * empty list, so the caller can tell "no recalls" apart from "the lookup
     * failed" (LM-18: a failed lookup is 'recall status unknown', never 'no
     * recalls'). Optional: only the server service implements it; other
     * adapters keep the forgiving checkRecalls.
     */
    checkRecallsStrict?(year: number, make: string, model: string): Promise<SafetyRecall[]>;

    validateVin(vin: string): Promise<boolean>;
}
