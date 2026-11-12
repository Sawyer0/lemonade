// Next-test planner (LM-04): lowest expected cost to resolve, cheapest
// tier first, with a challenger for the leader.
//
// Heckerman/Breese probability-over-cost ordering: a test's expected
// cost to resolve is its full cost divided by the probability it
// discriminates the leading hypotheses, so a cheap test that separates
// the leaders beats an expensive certain one. Cost is labor + parts +
// downtime + risk, priced from the shop's rates in config; a test that
// needs deeper disassembly than the vehicle is in never reaches the
// planner — the library's eligibility gate already excludes it. When no
// test discriminates at all, the fallback is information gain per
// dollar. The challenger is the cheapest test that could disprove the
// leading hypothesis: a negative result on it has to hurt the leader.
import { SHARED_CONFIG } from '../../config';
import { COST_TIER_RANK, type TestLibrary, type TestLibraryState } from '../tests/testLibrary';
import type { CostTier, SafetyClass, TestDefinition } from '../tests/testSchema';
import { renderTestSpoken } from '../tests/stepSpeech';
import type { CostBreakdown, Differential, NextTest } from './types';
import type { TestRates } from './update';
import { expectedInformationGain } from './informationGain';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

/** What the planner needs to know about the vehicle: where it is in disassembly, what is satisfied, what ran. */
export interface PlannerState extends TestLibraryState {
    completedTestIds: ReadonlySet<string>;
}

/** Full cost of one run: labor + parts + downtime + risk, all in dollars. */
export function testCostUsd(test: TestDefinition, library: TestLibrary): CostBreakdown {
    const laborUsd = test.cost.laborMinutes * LOOP.LABOR_RATE_USD_PER_MINUTE;
    const partsUsd = library.totalPartsCostUsd(test);
    const downtimeUsd = test.cost.laborMinutes * LOOP.DOWNTIME_USD_PER_MINUTE;
    const riskUsd = LOOP.RISK_USD_BY_SAFETY_CLASS[test.safetyClass as SafetyClass];
    return { laborUsd, partsUsd, downtimeUsd, riskUsd, totalUsd: laborUsd + partsUsd + downtimeUsd + riskUsd };
}

/**
 * Probability this test separates the leaders: the probability mass of
 * the hypotheses it targets, weighted by how much better than guessing
 * each target rate is. Zero means the test cannot move the differential.
 */
export function discriminationProbability(
    differential: Differential,
    test: TestDefinition,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): number {
    let mass = 0;
    for (const hypothesis of differential.hypotheses) {
        const target = test.targets.find((candidate) => candidate.hypothesisId === hypothesis.id);
        if (!target) {
            continue;
        }
        const rates = effectiveRates(test, hypothesis.id);
        mass += hypothesis.probability * Math.max(0, rates.hitRate - rates.falseAlarmRate);
    }
    return mass;
}

function toNextTest(
    test: TestDefinition,
    library: TestLibrary,
    discrimination: number,
    cost: CostBreakdown,
    state: PlannerState,
): NextTest {
    return {
        testId: test.id,
        title: test.title,
        costTier: test.costTier as CostTier,
        cost,
        expectedValuePerDollar: cost.totalUsd > 0 ? discrimination / cost.totalUsd : discrimination,
        discriminationProbability: discrimination,
        steps: test.steps,
        spoken: renderTestSpoken(test),
        safetyBlockers: library
            .safetyBlockers(test, state.satisfiedPreconditionIds)
            .map((precondition) => precondition.description),
    };
}

interface RankedPlan {
    test: TestDefinition;
    cost: CostBreakdown;
    discrimination: number;
    gain: number;
}

/**
 * The cheapest test that could disprove the leading hypothesis: it
 * targets the leader, its hit rate clears the challenger bar, and it is
 * not the test already planned. Null when no test qualifies — a leader
 * with no disproof available is itself worth knowing.
 */
export function findChallenger(
    differential: Differential,
    library: TestLibrary,
    state: PlannerState,
    plannedTestId: string | undefined,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): NextTest | null {
    const leader = differential.hypotheses[0];
    if (!leader) {
        return null;
    }
    const disproofs: RankedPlan[] = [];
    for (const test of library.eligibleTests(state)) {
        if (test.id === plannedTestId || state.completedTestIds.has(test.id)) {
            continue;
        }
        const target = test.targets.find((candidate) => candidate.hypothesisId === leader.id);
        if (!target) {
            continue;
        }
        const rates = effectiveRates(test, leader.id);
        if (rates.hitRate < LOOP.CHALLENGER_MIN_HIT_RATE) {
            continue;
        }
        const cost = testCostUsd(test, library);
        disproofs.push({
            test,
            cost,
            discrimination: discriminationProbability(differential, test, effectiveRates),
            gain: 0,
        });
    }
    disproofs.sort(
        (a, b) =>
            a.cost.totalUsd - b.cost.totalUsd ||
            COST_TIER_RANK[a.test.costTier] - COST_TIER_RANK[b.test.costTier] ||
            a.test.id.localeCompare(b.test.id),
    );
    const best = disproofs[0];
    return best ? toNextTest(best.test, library, best.discrimination, best.cost, state) : null;
}

export interface PlanResult {
    nextTest: NextTest | null;
    challenger: NextTest | null;
}

/**
 * Picks the next test: lowest expected cost to resolve (cost divided by
 * discrimination probability), cheapest tier then lowest labor on ties.
 * When no eligible test discriminates, ranks by information gain per
 * dollar instead. The challenger rides along whenever one exists.
 */
export function planNextTest(
    differential: Differential,
    library: TestLibrary,
    state: PlannerState,
    effectiveRates: (test: TestDefinition, hypothesisId: string) => TestRates,
): PlanResult {
    const ids = differential.hypotheses.map((hypothesis) => hypothesis.id);
    const ranked: RankedPlan[] = library
        .rankCandidates(ids, state)
        .filter((candidate) => !state.completedTestIds.has(candidate.test.id))
        .map((candidate) => {
            const cost = testCostUsd(candidate.test, library);
            return {
                test: candidate.test,
                cost,
                discrimination: discriminationProbability(differential, candidate.test, effectiveRates),
                gain: expectedInformationGain(differential, candidate.test, effectiveRates),
            };
        });
    const discriminating = ranked.filter((plan) => plan.discrimination > 0);
    // Gains below this are float noise from the entropy sums, not a real
    // difference: treating them as zero keeps the fallback order
    // deterministic (cheapest tier first) instead of noise-driven.
    const gainValue = (plan: RankedPlan): number => (plan.gain < 1e-9 ? 0 : plan.gain);
    const ordered =
        discriminating.length > 0
            ? [...discriminating].sort(
                  (a, b) =>
                      a.cost.totalUsd / a.discrimination - b.cost.totalUsd / b.discrimination ||
                      COST_TIER_RANK[a.test.costTier] - COST_TIER_RANK[b.test.costTier] ||
                      a.cost.totalUsd - b.cost.totalUsd ||
                      a.test.id.localeCompare(b.test.id),
              )
            : [...ranked].sort(
                  (a, b) =>
                      gainValue(b) / Math.max(1, b.cost.totalUsd) - gainValue(a) / Math.max(1, a.cost.totalUsd) ||
                      COST_TIER_RANK[a.test.costTier] - COST_TIER_RANK[b.test.costTier] ||
                      a.test.id.localeCompare(b.test.id),
              );
    const best = ordered[0];
    if (!best) {
        return { nextTest: null, challenger: null };
    }
    const nextTest = toNextTest(best.test, library, best.discrimination, best.cost, state);
    return {
        nextTest,
        challenger: findChallenger(differential, library, state, best.test.id, effectiveRates),
    };
}
