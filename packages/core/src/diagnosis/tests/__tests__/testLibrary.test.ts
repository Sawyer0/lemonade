import { describe, it, expect } from 'vitest';
import { TestLibrary, type TestLibraryState } from '../testLibrary';
import { validTestDefinition } from './testDefinitionFactory';

const verifiedDefinition = validTestDefinition();
const unverifiedDefinition = validTestDefinition({
    id: 'ask-misfire-conditions',
    title: 'Ask when the misfire happens',
    costTier: 'ask',
    disassemblyState: 'none',
    targets: [{ hypothesisId: 'misfire-cylinder-3', dtcCodes: ['P0300'], hitRate: 0.9, falseAlarmRate: 0.1 }],
    cost: { laborMinutes: 5, tools: [], parts: [] },
    preconditions: [],
    verification: { status: 'unverified', source: 'llm-draft' },
});

const openState: TestLibraryState = {
    disassemblyState: 'none',
    satisfiedPreconditionIds: new Set(['ventilation']),
};

describe('TestLibrary.fromDefinitions', () => {
    it('builds from validated definitions', () => {
        const library = TestLibrary.fromDefinitions([verifiedDefinition, unverifiedDefinition]);
        expect(library.all()).toHaveLength(2);
        expect(library.byId('ask-misfire-conditions')?.title).toBe('Ask when the misfire happens');
    });

    it('rejects duplicate test ids', () => {
        expect(() => TestLibrary.fromDefinitions([verifiedDefinition, verifiedDefinition])).toThrow(
            /Duplicate test id/,
        );
    });

    it('rejects an incomplete definition instead of building', () => {
        const incomplete = validTestDefinition({ steps: [] });
        expect(() => TestLibrary.fromDefinitions([incomplete])).toThrow();
    });
});

describe('TestLibrary lookups', () => {
    const library = TestLibrary.fromDefinitions([verifiedDefinition, unverifiedDefinition]);

    it('finds tests by hypothesis', () => {
        expect(library.forHypothesis('catalyst-degraded')).toHaveLength(1);
        expect(library.forHypothesis('no-such-hypothesis')).toHaveLength(0);
    });

    it('finds tests by DTC code, case-insensitively', () => {
        expect(library.forDtc('p0300')).toHaveLength(1);
        expect(library.forDtc('P0420')).toHaveLength(1);
        expect(library.forDtc('P9999')).toHaveLength(0);
    });

    it('finds tests by cost tier', () => {
        expect(library.byCostTier('ask')).toHaveLength(1);
        expect(library.byCostTier('tear-down')).toHaveLength(0);
    });

    it('sums part costs', () => {
        const withParts = validTestDefinition({
            id: 'inspect-valve-train',
            cost: {
                laborMinutes: 120,
                tools: [],
                parts: [
                    { name: 'valve cover gasket', estimatedCostUsd: 25 },
                    { name: 'tube seal set', estimatedCostUsd: 12.5 },
                ],
            },
        });
        expect(library.totalPartsCostUsd(withParts)).toBe(37.5);
        expect(library.totalPartsCostUsd(verifiedDefinition)).toBe(0);
    });
});

describe('TestLibrary.effectiveRates', () => {
    const library = TestLibrary.fromDefinitions([verifiedDefinition, unverifiedDefinition]);

    it('passes verified rates through untouched', () => {
        expect(library.effectiveRates(verifiedDefinition, 'catalyst-degraded')).toEqual({
            hitRate: 0.85,
            falseAlarmRate: 0.15,
        });
    });

    it('shrinks unverified rates halfway toward uninformative', () => {
        // 0.9 shrinks to 0.7, 0.1 shrinks to 0.3: a draft never looks as
        // discriminating as a reviewed test with the same written numbers.
        expect(library.effectiveRates(unverifiedDefinition, 'misfire-cylinder-3')).toEqual({
            hitRate: 0.7,
            falseAlarmRate: 0.3,
        });
    });

    it('throws for a hypothesis the test does not target', () => {
        expect(() => library.effectiveRates(verifiedDefinition, 'vacuum-leak')).toThrow(/does not target/);
    });
});

describe('TestLibrary eligibility and safety preconditions', () => {
    const library = TestLibrary.fromDefinitions([verifiedDefinition, unverifiedDefinition]);

    it('lists the unmet safety preconditions as blockers', () => {
        expect(library.safetyBlockers(verifiedDefinition, new Set())).toHaveLength(1);
        expect(library.safetyBlockers(verifiedDefinition, new Set(['ventilation']))).toHaveLength(0);
    });

    it('is eligible when disassembly is sufficient and every precondition is met', () => {
        expect(library.isEligible(verifiedDefinition, openState)).toBe(true);
    });

    it('is never eligible while a safety precondition is unmet', () => {
        expect(
            library.isEligible(verifiedDefinition, {
                disassemblyState: 'none',
                satisfiedPreconditionIds: new Set(),
            }),
        ).toBe(false);
    });

    it('is never eligible while a non-safety precondition is unmet', () => {
        const warmRequired = validTestDefinition({
            id: 'measure-fuel-trim',
            preconditions: [
                { id: 'ventilation', description: 'Ventilate.', safety: true },
                { id: 'engine-warm', description: 'Engine warm.', safety: false },
            ],
        });
        expect(library.isEligible(warmRequired, openState)).toBe(false);
        expect(
            library.isEligible(warmRequired, {
                disassemblyState: 'none',
                satisfiedPreconditionIds: new Set(['ventilation', 'engine-warm']),
            }),
        ).toBe(true);
    });

    it('is never eligible before the vehicle is taken apart far enough', () => {
        const teardown = validTestDefinition({
            id: 'inspect-valve-train',
            costTier: 'tear-down',
            disassemblyState: 'teardown',
            preconditions: [],
        });
        expect(library.isEligible(teardown, openState)).toBe(false);
        expect(
            library.isEligible(teardown, { disassemblyState: 'teardown', satisfiedPreconditionIds: new Set() }),
        ).toBe(true);
    });

    it('eligibleTests excludes blocked tests', () => {
        const blocked = library.eligibleTests({
            disassemblyState: 'none',
            satisfiedPreconditionIds: new Set(),
        });
        expect(blocked.map((test) => test.id)).toEqual(['ask-misfire-conditions']);
    });
});

describe('TestLibrary.rankCandidates', () => {
    it('returns eligible tests cheapest first with effective rates and costs', () => {
        const swap = validTestDefinition({
            id: 'swap-coil-cylinder',
            costTier: 'swap',
            disassemblyState: 'component-exposed',
            targets: [
                { hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0301'], hitRate: 0.9, falseAlarmRate: 0.05 },
            ],
            cost: { laborMinutes: 20, tools: [], parts: [] },
            preconditions: [],
        });
        const look = validTestDefinition({
            id: 'look-plug-coil-condition',
            costTier: 'look',
            disassemblyState: 'component-exposed',
            targets: [
                { hypothesisId: 'ignition-coil-failure', dtcCodes: ['P0301'], hitRate: 0.7, falseAlarmRate: 0.2 },
            ],
            cost: { laborMinutes: 15, tools: [], parts: [] },
            preconditions: [],
        });
        const library = TestLibrary.fromDefinitions([swap, look]);
        const ranked = library.rankCandidates(['ignition-coil-failure'], {
            disassemblyState: 'component-exposed',
            satisfiedPreconditionIds: new Set(),
        });
        expect(ranked.map((candidate) => candidate.test.id)).toEqual([
            'look-plug-coil-condition',
            'swap-coil-cylinder',
        ]);
        expect(ranked[0]).toMatchObject({ hitRate: 0.7, falseAlarmRate: 0.2, laborMinutes: 15, partsCostUsd: 0 });
    });

    it('lists a test once even when it targets several wanted hypotheses', () => {
        const both = validTestDefinition({
            id: 'measure-fuel-trim',
            targets: [
                { hypothesisId: 'vacuum-leak', dtcCodes: ['P0171'], hitRate: 0.8, falseAlarmRate: 0.2 },
                { hypothesisId: 'weak-fuel-pump', dtcCodes: ['P0171'], hitRate: 0.75, falseAlarmRate: 0.25 },
            ],
            preconditions: [],
        });
        const library = TestLibrary.fromDefinitions([both]);
        const ranked = library.rankCandidates(['vacuum-leak', 'weak-fuel-pump'], {
            disassemblyState: 'none',
            satisfiedPreconditionIds: new Set(),
        });
        expect(ranked).toHaveLength(1);
        expect(ranked[0].targets).toHaveLength(2);
    });

    it('returns nothing when no eligible test speaks to the hypotheses', () => {
        const library = TestLibrary.fromDefinitions([verifiedDefinition]);
        expect(
            library.rankCandidates(['vacuum-leak'], {
                disassemblyState: 'none',
                satisfiedPreconditionIds: new Set(['ventilation']),
            }),
        ).toHaveLength(0);
    });
});
