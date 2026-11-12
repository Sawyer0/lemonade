import { describe, expect, it } from 'vitest';
import { TestLibrary, type TestDefinition } from '@lemonade/core';
import { formatRunCost, priceRun } from './costModel';

function testFixture(overrides: Partial<TestDefinition> = {}): TestDefinition {
    return {
        id: 'measure-coolant-pressure',
        title: 'Pressure test the cooling system',
        summary: 'Pressurise the cooling system and watch for a pressure drop.',
        costTier: 'measure',
        safetyClass: 'caution',
        hazards: [],
        disassemblyState: 'none',
        targets: [{ hypothesisId: 'coolant-leak', hitRate: 0.9, falseAlarmRate: 0.1 }],
        cost: {
            laborMinutes: 30,
            tools: ['coolant pressure tester'],
            parts: [{ name: 'pressure tester adapter', estimatedCostUsd: 40 }],
        },
        preconditions: [],
        steps: [
            {
                location: 'coolant reservoir',
                instruction: 'fit the pressure tester and pump to 15 psi',
                expected: { kind: 'range', min: 14, max: 16, unit: 'psi' },
                outcomeYes: 'pressure holds, so the system is sealed',
                outcomeNo: 'pressure drops, so there is a leak to find',
            },
        ],
        verification: { status: 'verified', source: 'manual', reviewedBy: 'lemonade-bench' },
        ...overrides,
    };
}

describe('priceRun', () => {
    it('prices labor, parts, downtime and risk from the shop rates, plus the repair', () => {
        const library = TestLibrary.fromDefinitions([testFixture()]);
        const [test] = library.all();
        if (test === undefined) {
            throw new Error('expected the fixture test');
        }
        // 30 labor minutes at $2/min = $60 labor, $40 parts, 30 min
        // downtime at $1/min = $30, caution risk $25: $155 for the test.
        expect(priceRun([test], library, 200)).toEqual({
            laborUsd: 60,
            partsUsd: 40,
            downtimeUsd: 30,
            riskUsd: 25,
            repairUsd: 200,
            totalUsd: 355,
            testsPriced: 1,
        });
    });

    it('sums several tests and prices a routine test with no parts or risk', () => {
        const routine = testFixture({
            id: 'look-belt-condition',
            title: 'Look at the serpentine belt',
            costTier: 'look',
            safetyClass: 'routine',
            targets: [{ hypothesisId: 'alternator', hitRate: 0.9, falseAlarmRate: 0.1 }],
            cost: { laborMinutes: 15, tools: ['flashlight'], parts: [] },
        });
        const library = TestLibrary.fromDefinitions([testFixture(), routine]);
        const priced = priceRun(library.all(), library, 0);
        expect(priced.laborUsd).toBe(90);
        expect(priced.partsUsd).toBe(40);
        expect(priced.downtimeUsd).toBe(45);
        expect(priced.riskUsd).toBe(25);
        expect(priced.totalUsd).toBe(200);
        expect(priced.testsPriced).toBe(2);
    });

    it('prices an empty run as the repair alone', () => {
        const library = TestLibrary.fromDefinitions([testFixture()]);
        expect(priceRun([], library, 150)).toEqual({
            laborUsd: 0,
            partsUsd: 0,
            downtimeUsd: 0,
            riskUsd: 0,
            repairUsd: 150,
            totalUsd: 150,
            testsPriced: 0,
        });
    });

    it('formats the cost as one readable line', () => {
        const library = TestLibrary.fromDefinitions([testFixture()]);
        const [test] = library.all();
        if (test === undefined) {
            throw new Error('expected the fixture test');
        }
        expect(formatRunCost(priceRun([test], library, 200))).toBe(
            '$355 (labor $60, parts $40, downtime $30, risk $25, repair $200, 1 tests)',
        );
    });
});
