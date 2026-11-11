import { describe, it, expect } from 'vitest';
import { causeForNhtsaComponent, nhtsaComponentsMatch, parseNhtsaComponent } from '../component';

describe('parseNhtsaComponent', () => {
    it('splits a component path into uppercased segments', () => {
        expect(parseNhtsaComponent('ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR')).toEqual([
            'ENGINE AND ENGINE COOLING',
            'EXHAUST SYSTEM',
            'EMISSION CONTROL',
            'CATALYTIC CONVERTOR',
        ]);
    });

    it('throws on an empty component', () => {
        expect(() => parseNhtsaComponent('  ')).toThrowError('NHTSA component must name at least one segment');
    });
});

describe('nhtsaComponentsMatch', () => {
    it('matches a component to a record filed at a deeper level (prefix)', () => {
        expect(
            nhtsaComponentsMatch(
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR',
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR',
            ),
        ).toBe(true);
        expect(
            nhtsaComponentsMatch(
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR',
            ),
        ).toBe(true);
    });

    it('is case-insensitive and ignores surrounding spaces', () => {
        expect(
            nhtsaComponentsMatch(
                'engine and engine cooling : exhaust system',
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL',
            ),
        ).toBe(true);
    });

    it('never matches by substring: a bare segment is not its longer sibling', () => {
        expect(nhtsaComponentsMatch('ENGINE', 'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM')).toBe(false);
        expect(
            nhtsaComponentsMatch(
                'CATALYTIC CONVERTOR',
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR',
            ),
        ).toBe(false);
    });

    it('does not match unrelated components', () => {
        expect(
            nhtsaComponentsMatch(
                'SERVICE BRAKES, HYDRAULIC:FOUNDATION COMPONENTS:DISC:ROTOR',
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM',
            ),
        ).toBe(false);
    });
});

describe('causeForNhtsaComponent', () => {
    it('maps the catalytic-convertor leaf to the catalytic converter', () => {
        expect(
            causeForNhtsaComponent(
                'ENGINE AND ENGINE COOLING:EXHAUST SYSTEM:EMISSION CONTROL:CATALYTIC CONVERTOR',
            ),
        ).toBe('catalytic converter');
    });

    it('maps a record filed deeper than the mapped path (prefix)', () => {
        expect(causeForNhtsaComponent('FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP:LOW PRESSURE')).toBe('fuel pump');
    });

    it('returns null for an unmapped component instead of guessing', () => {
        expect(causeForNhtsaComponent('ELECTRICAL SYSTEM:WIRING')).toBeNull();
        expect(causeForNhtsaComponent('ENGINE AND ENGINE COOLING')).toBeNull();
    });
});
