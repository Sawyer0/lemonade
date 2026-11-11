import { describe, it, expect } from 'vitest';
import type { CaseReference } from '../../types/memory';
import { buildCustomerExport, exportVehicleCases } from '../customerExport';

const SHOP = 'shop-1';
const OTHER_SHOP = 'shop-2';
const VIN = '19XFB2F59FE000000';
const OTHER_VIN = '1HGCM82633A000001';

function cases(): CaseReference[] {
    return [
        { caseId: 'case-1', shopId: SHOP, vin: VIN },
        { caseId: 'case-2', shopId: SHOP, vin: VIN },
        { caseId: 'case-3', shopId: SHOP, vin: OTHER_VIN },
        { caseId: 'case-4', shopId: OTHER_SHOP, vin: VIN },
    ];
}

describe('exportVehicleCases', () => {
    it('contains only that vehicle cases at that shop', () => {
        expect(exportVehicleCases(cases(), SHOP, VIN).map((entry) => entry.caseId)).toEqual(['case-1', 'case-2']);
    });

    it('matches VINs case-insensitively', () => {
        expect(exportVehicleCases(cases(), SHOP, VIN.toLowerCase()).map((entry) => entry.caseId)).toEqual([
            'case-1',
            'case-2',
        ]);
    });

    it('returns nothing for a shop that never saw the vehicle', () => {
        expect(exportVehicleCases(cases(), OTHER_SHOP, OTHER_VIN)).toEqual([]);
    });
});

describe('buildCustomerExport', () => {
    it('builds an export scoped to one shop and VIN', () => {
        const exported = buildCustomerExport(cases(), SHOP, VIN);
        expect(exported.shopId).toBe(SHOP);
        expect(exported.vin).toBe(VIN);
        expect(exported.cases).toHaveLength(2);
    });
});
