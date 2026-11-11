import { describe, it, expect } from 'vitest';
import { licenseFor, requireProductionLicense, PRIOR_SOURCE_LICENSES } from '../licenses';
import { PriorSourceSchema } from '../types';

describe('source licenses', () => {
    it('records a license check for every ingestion source', () => {
        const sources = PriorSourceSchema.options;
        expect(sources).toHaveLength(6);
        for (const source of sources) {
            const license = licenseFor(source);
            expect(license.source).toBe(source);
            expect(license.license.length).toBeGreaterThan(0);
            expect(license.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(license.evidence.length).toBeGreaterThan(0);
        }
        expect(Object.keys(PRIOR_SOURCE_LICENSES)).toHaveLength(6);
    });

    it('records NHTSA feeds as public domain and approved for production', () => {
        for (const source of ['nhtsa-complaints', 'nhtsa-recalls', 'nhtsa-tsb'] as const) {
            const license = licenseFor(source);
            expect(license.licenseStatus).toBe('public-domain');
            expect(license.approvedForProduction).toBe(true);
        }
    });

    it('records AutoRepairBench as research-use-only and NOT approved for production', () => {
        const license = licenseFor('autorepairbench');
        expect(license.licenseStatus).toBe('research-use-only');
        expect(license.approvedForProduction).toBe(false);
        expect(license.license).toContain('No dataset license file');
        expect(() => requireProductionLicense('autorepairbench')).toThrowError('not approved for production priors');
    });

    it('approves shop-owned sources for production within the owning shop', () => {
        expect(requireProductionLicense('repair-order').approvedForProduction).toBe(true);
        expect(requireProductionLicense('lemonade-ledger').approvedForProduction).toBe(true);
        expect(requireProductionLicense('nhtsa-recalls').approvedForProduction).toBe(true);
    });
});
