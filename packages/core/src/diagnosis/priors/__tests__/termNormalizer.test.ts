import { describe, it, expect } from 'vitest';
import { clusterRepairTerms, extractRepairTerms, normalizeRepairTerm } from '../termNormalizer';

describe('normalizeRepairTerm', () => {
    it.each([
        ['cat', 'catalytic converter'],
        ['Catalytic Convertor', 'catalytic converter'],
        ['O2 sensor', 'oxygen sensor'],
        ['coil pack', 'ignition coil'],
        ['MAF sensor', 'mass airflow sensor'],
        ['purge valve', 'evap purge valve'],
        ['  Fuel Pump ', 'fuel pump'],
    ])('normalises %s to %s', (raw, expected) => {
        expect(normalizeRepairTerm(raw)).toBe(expected);
    });

    it('leaves an unknown term as its cleaned text', () => {
        expect(normalizeRepairTerm('  Turbocharger!! ')).toBe('turbocharger');
    });
});

describe('extractRepairTerms', () => {
    it('extracts canonical causes from repair-order text in order', () => {
        expect(extractRepairTerms('Replaced cat and O2 sensor; cleared P0420.')).toEqual([
            'catalytic converter',
            'oxygen sensor',
        ]);
    });

    it('prefers the longest phrase so a converter is not split', () => {
        expect(extractRepairTerms('Replaced catalytic converter.')).toEqual(['catalytic converter']);
    });

    it('skips words it does not recognize', () => {
        expect(extractRepairTerms('Inspected the vehicle and advised the customer.')).toEqual([]);
    });
});

describe('clusterRepairTerms', () => {
    it('groups synonyms into one cause with a count, most frequent first', () => {
        expect(
            clusterRepairTerms(['cat', 'catalytic convertor', 'O2 sensor', 'oxygen sensor', 'oxygen sensor']),
        ).toEqual([
            { hypothesis: 'oxygen sensor', observationCount: 3 },
            { hypothesis: 'catalytic converter', observationCount: 2 },
        ]);
    });
});
