import type { CaseReference } from '../types/memory';

/**
 * Customer export (LM-31): the shop can export a case report or full history
 * for the customer. The export contains only that vehicle's cases.
 */

export interface CustomerExport {
    shopId: string;
    vin: string;
    cases: CaseReference[];
}

function normalizedVin(vin: string): string {
    return vin.toUpperCase();
}

/** Returns only the cases for this shop and VIN. Nothing else leaves the shop. */
export function exportVehicleCases(cases: ReadonlyArray<CaseReference>, shopId: string, vin: string): CaseReference[] {
    const wantedVin = normalizedVin(vin);
    return cases.filter((entry) => entry.shopId === shopId && normalizedVin(entry.vin) === wantedVin);
}

export function buildCustomerExport(cases: ReadonlyArray<CaseReference>, shopId: string, vin: string): CustomerExport {
    return { shopId, vin: normalizedVin(vin), cases: exportVehicleCases(cases, shopId, vin) };
}
