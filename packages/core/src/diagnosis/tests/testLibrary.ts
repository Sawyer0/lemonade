import { SHARED_CONFIG } from '../../config';
import {
    TestDefinitionSchema,
    type CostTier,
    type DisassemblyState,
    type TestDefinition,
    type TestPrecondition,
    type TestTarget,
} from './testSchema';

// --- Test library (LM-34) ---
// The planner-facing read side of the typed test library. A library is built
// from validated definitions (parsed from data/tests/*.yaml by yamlLoader);
// it never invents a cost or a rate. Unverified entries get their rates
// shrunk toward uninformative before the planner sees them.

/** Deeper disassembly ranks higher; a test is runnable once the vehicle is at or past its required state. */
export const DISASSEMBLY_RANK: Record<DisassemblyState, number> = {
    none: 0,
    'panels-removed': 1,
    'component-exposed': 2,
    'component-removed': 3,
    teardown: 4,
};

/** Cheapest tier first: the planner tries questions before it pulls parts. */
export const COST_TIER_RANK: Record<CostTier, number> = {
    ask: 0,
    look: 1,
    measure: 2,
    swap: 3,
    'tear-down': 4,
};

export interface TestLibraryState {
    disassemblyState: DisassemblyState;
    satisfiedPreconditionIds: ReadonlySet<string>;
}

export interface EffectiveRates {
    hitRate: number;
    falseAlarmRate: number;
}

export interface RankedCandidate {
    test: TestDefinition;
    targets: TestTarget[];
    hitRate: number;
    falseAlarmRate: number;
    laborMinutes: number;
    partsCostUsd: number;
}

/**
 * Pulls a rate toward 0.5 (uninformative) by the shrink factor. A verified
 * rate passes through untouched; an unverified one is trusted only halfway.
 */
export function shrinkRate(rate: number, shrinkFactor: number): number {
    return 0.5 + (rate - 0.5) * (1 - shrinkFactor);
}

export class TestLibrary {
    private readonly definitionsById: Map<string, TestDefinition>;

    private constructor(definitions: TestDefinition[]) {
        this.definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
    }

    /** Builds a library from already-validated definitions; duplicate ids are rejected. */
    static fromDefinitions(definitions: TestDefinition[]): TestLibrary {
        const parsed = definitions.map((definition) => TestDefinitionSchema.parse(definition));
        const seen = new Set<string>();
        for (const definition of parsed) {
            if (seen.has(definition.id)) {
                throw new Error(`Duplicate test id in library: ${definition.id}`);
            }
            seen.add(definition.id);
        }
        return new TestLibrary(parsed);
    }

    all(): TestDefinition[] {
        return [...this.definitionsById.values()];
    }

    byId(id: string): TestDefinition | undefined {
        return this.definitionsById.get(id);
    }

    forHypothesis(hypothesisId: string): TestDefinition[] {
        return this.all().filter((test) => test.targets.some((target) => target.hypothesisId === hypothesisId));
    }

    forDtc(dtcCode: string): TestDefinition[] {
        const code = dtcCode.toUpperCase();
        return this.all().filter((test) =>
            test.targets.some((target) => target.dtcCodes?.some((dtc) => dtc.toUpperCase() === code)),
        );
    }

    byCostTier(costTier: CostTier): TestDefinition[] {
        return this.all().filter((test) => test.costTier === costTier);
    }

    /** Parts cost for one run of the test. Labor is priced by the shop, not the library. */
    totalPartsCostUsd(test: TestDefinition): number {
        return test.cost.parts.reduce((sum, part) => sum + part.estimatedCostUsd, 0);
    }

    /**
     * The rates the planner may use for this test against this hypothesis.
     * Verified tests pass through; unverified (LLM-drafted, unreviewed) tests
     * are shrunk toward 0.5, so a draft can never look as discriminating as
     * a reviewed test with the same written numbers.
     */
    effectiveRates(test: TestDefinition, hypothesisId: string): EffectiveRates {
        const target = test.targets.find((candidate) => candidate.hypothesisId === hypothesisId);
        if (!target) {
            throw new Error(`Test ${test.id} does not target hypothesis ${hypothesisId}`);
        }
        if (test.verification.status === 'verified') {
            return { hitRate: target.hitRate, falseAlarmRate: target.falseAlarmRate };
        }
        const shrinkFactor = SHARED_CONFIG.TEST_LIBRARY.UNVERIFIED_SHRINK_FACTOR;
        return {
            hitRate: shrinkRate(target.hitRate, shrinkFactor),
            falseAlarmRate: shrinkRate(target.falseAlarmRate, shrinkFactor),
        };
    }

    /** Safety preconditions of this test that are not yet satisfied. Never empty-check a hazardous test away. */
    safetyBlockers(test: TestDefinition, satisfiedPreconditionIds: ReadonlySet<string>): TestPrecondition[] {
        return test.preconditions.filter(
            (precondition) => precondition.safety && !satisfiedPreconditionIds.has(precondition.id),
        );
    }

    /** Every precondition of this test that is not yet satisfied, safety or not. */
    missingPreconditions(test: TestDefinition, satisfiedPreconditionIds: ReadonlySet<string>): TestPrecondition[] {
        return test.preconditions.filter((precondition) => !satisfiedPreconditionIds.has(precondition.id));
    }

    /**
     * A test is eligible when the vehicle is already taken apart at least as
     * far as the test needs and every precondition is satisfied. Safety
     * preconditions are enforced here, not advisory: a test with an unmet
     * safety precondition is never eligible.
     */
    isEligible(test: TestDefinition, state: TestLibraryState): boolean {
        if (DISASSEMBLY_RANK[state.disassemblyState] < DISASSEMBLY_RANK[test.disassemblyState]) {
            return false;
        }
        return this.missingPreconditions(test, state.satisfiedPreconditionIds).length === 0;
    }

    eligibleTests(state: TestLibraryState): TestDefinition[] {
        return this.all().filter((test) => this.isEligible(test, state));
    }

    /**
     * Planner query (LM-04): the eligible tests that speak to any of these
     * hypotheses, cheapest first (tier, then labor minutes), each carrying
     * the effective rates and costs the planner needs to choose. A test
     * appears once even when it targets several of the hypotheses.
     */
    rankCandidates(hypothesisIds: string[], state: TestLibraryState): RankedCandidate[] {
        const wanted = new Set(hypothesisIds);
        const candidates: RankedCandidate[] = [];
        for (const test of this.eligibleTests(state)) {
            const targets = test.targets.filter((target) => wanted.has(target.hypothesisId));
            if (targets.length === 0) {
                continue;
            }
            const bestTarget = targets.reduce((best, target) =>
                target.hitRate - target.falseAlarmRate > best.hitRate - best.falseAlarmRate ? target : best,
            );
            const rates = this.effectiveRates(test, bestTarget.hypothesisId);
            candidates.push({
                test,
                targets,
                hitRate: rates.hitRate,
                falseAlarmRate: rates.falseAlarmRate,
                laborMinutes: test.cost.laborMinutes,
                partsCostUsd: this.totalPartsCostUsd(test),
            });
        }
        return candidates.sort(
            (a, b) =>
                COST_TIER_RANK[a.test.costTier] - COST_TIER_RANK[b.test.costTier] ||
                a.laborMinutes - b.laborMinutes ||
                a.test.id.localeCompare(b.test.id),
        );
    }
}
