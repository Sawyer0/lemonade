import { describe, it, expect } from 'vitest';
import { submitGlobalAggregate, validateAnonymizedAggregate } from '../globalPriors';

describe('global priors', () => {
    it('accepts an anonymized aggregate with no identifying fields', () => {
        const aggregate = validateAnonymizedAggregate({
            vehicleFamily: 'F-150',
            symptomCategory: 'brake-noise',
            fixCategory: 'pads',
            shopCount: 3,
            caseCount: 12,
        });
        expect(aggregate.caseCount).toBe(12);
    });

    it('rejects a one-shop or few-case aggregate: the floor keeps it anonymous', () => {
        expect(() =>
            validateAnonymizedAggregate({
                vehicleFamily: 'F-150',
                symptomCategory: 'brake-noise',
                fixCategory: 'pads',
                shopCount: 1,
                caseCount: 12,
            }),
        ).toThrowError();
        expect(() =>
            validateAnonymizedAggregate({
                vehicleFamily: 'F-150',
                symptomCategory: 'brake-noise',
                fixCategory: 'pads',
                shopCount: 3,
                caseCount: 2,
            }),
        ).toThrowError();
    });

    it('rejects a payload carrying a VIN', () => {
        expect(() =>
            validateAnonymizedAggregate({
                vehicleFamily: 'F-150',
                symptomCategory: 'brake-noise',
                fixCategory: 'pads',
                shopCount: 3,
                caseCount: 12,
                vin: '19XFB2F59FE000000',
            }),
        ).toThrowError();
    });

    it('rejects a payload carrying customer data', () => {
        expect(() =>
            validateAnonymizedAggregate({
                vehicleFamily: 'F-150',
                symptomCategory: 'brake-noise',
                fixCategory: 'pads',
                shopCount: 3,
                caseCount: 12,
                customerName: 'Dawan',
            }),
        ).toThrowError();
    });

    it('refuses submissions while the flag is off', () => {
        expect(() =>
            submitGlobalAggregate({
                vehicleFamily: 'F-150',
                symptomCategory: 'brake-noise',
                fixCategory: 'pads',
                shopCount: 3,
                caseCount: 12,
            }),
        ).toThrowError('Global priors are disabled.');
    });
});
