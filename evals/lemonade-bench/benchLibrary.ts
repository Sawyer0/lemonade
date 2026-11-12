// Bench library (LM-36): turns a rule table into the LM-04 engine's
// inputs — a differential of candidate causes from the complaint, and
// a test library with one ask test and one measure test per cause.
//
// The proposer is the deterministic stand-in for the LLM proposer: the
// causes whose keyword sets match the complaint get most of the prior
// mass, near-miss confusables that share a keyword get a share, and
// every other cause in the table keeps a small background share, so no
// case starts as a single-candidate differential that would commit
// with no evidence at all. The priors name causes; they never name the
// winner — matched causes split their share equally.
//
// The test rates are the simulation's own parameters, set by hand in
// the spec tables and reviewed with the bench: an ask test is a cheap
// weak question (hit 0.70, false alarm 0.35), a measure test is a
// stronger check (hit 0.90, false alarm 0.10). They are marked
// verified/manual for exactly that reason — they are not unreviewed
// LLM drafts, so the library's draft-shrink must not apply to them.
// The bench passes no repair costs to the loop: the loop then commits
// on the probability threshold alone, and repair dollars enter through
// the cost model, not the stop rule.
import { TestLibrary, type DiagnosticLoopInput, type TestDefinition, type TestPart } from '@lemonade/core';
import { matchingRules, nearMissRules, type FakeRule } from '../replay/fakeMechanic';
import { diagnosisMatches } from '../replay/replayRunner';
import type { CaseSnapshot } from './snapshot';

/** Simulation parameters for one rule: the ask, the check, and the repair. */
export interface BenchRuleSpec {
    ruleId: string;
    question: string;
    checkTitle: string;
    checkLocation: string;
    checkMinutes: number;
    checkParts: TestPart[];
    repairUsd: number;
    safetyCritical: boolean;
}

/** One rule table: the causes the proposer can name and their bench parameters. */
export interface BenchRuleTable {
    rules: FakeRule[];
    specsById: Map<string, BenchRuleSpec>;
}

export function benchRuleTable(rules: FakeRule[], specs: BenchRuleSpec[]): BenchRuleTable {
    const specsById = new Map(specs.map((spec) => [spec.ruleId, spec]));
    for (const rule of rules) {
        if (!specsById.has(rule.id)) {
            throw new Error(`LemonadeBench rule table is missing bench parameters for ${rule.id}`);
        }
    }
    return { rules, specsById };
}

export function askTestId(ruleId: string): string {
    return `ask-${ruleId}`;
}

export function measureTestId(ruleId: string): string {
    return `measure-${ruleId}`;
}

const ASK_HIT_RATE = 0.7;
const ASK_FALSE_ALARM_RATE = 0.35;
const MEASURE_HIT_RATE = 0.9;
const MEASURE_FALSE_ALARM_RATE = 0.1;
const ASK_LABOR_MINUTES = 5;

function benchTestDefinition(spec: BenchRuleSpec, tier: 'ask' | 'measure'): TestDefinition {
    const isAsk = tier === 'ask';
    return {
        id: isAsk ? askTestId(spec.ruleId) : measureTestId(spec.ruleId),
        title: isAsk ? `Ask about ${spec.ruleId}` : spec.checkTitle,
        summary: isAsk
            ? `Ask the tech ${spec.question} before touching the vehicle.`
            : `${spec.checkTitle} at the ${spec.checkLocation}.`,
        costTier: tier,
        safetyClass: !isAsk && spec.safetyCritical ? 'caution' : 'routine',
        hazards: [],
        disassemblyState: 'none',
        targets: [
            {
                hypothesisId: spec.ruleId,
                hitRate: isAsk ? ASK_HIT_RATE : MEASURE_HIT_RATE,
                falseAlarmRate: isAsk ? ASK_FALSE_ALARM_RATE : MEASURE_FALSE_ALARM_RATE,
            },
        ],
        cost: {
            laborMinutes: isAsk ? ASK_LABOR_MINUTES : spec.checkMinutes,
            tools: [],
            parts: isAsk ? [] : spec.checkParts,
        },
        preconditions: [],
        steps: [
            {
                location: isAsk ? 'driver seat, talking with the driver' : spec.checkLocation,
                instruction: isAsk ? `ask ${spec.question}` : `run the ${spec.checkTitle.toLowerCase()}`,
                expected: {
                    kind: 'text',
                    text: isAsk ? 'a clear yes or no' : 'a clear fault, or a reading in the normal range',
                },
                outcomeYes: isAsk
                    ? `the answer points at ${spec.ruleId}, so run its check next`
                    : `the check confirms ${spec.ruleId}, so commit to that repair`,
                outcomeNo: isAsk
                    ? `no pattern points at ${spec.ruleId}, so move to the next cause`
                    : `the check is normal, so ${spec.ruleId} is unlikely`,
            },
        ],
        verification: { status: 'verified', source: 'manual', reviewedBy: 'lemonade-bench' },
    };
}

/** One ask test and one measure test per rule in the table. */
export function benchTestDefinitions(table: BenchRuleTable): TestDefinition[] {
    return table.rules.flatMap((rule) => {
        const spec = table.specsById.get(rule.id);
        if (spec === undefined) {
            throw new Error(`LemonadeBench rule table is missing bench parameters for ${rule.id}`);
        }
        return [benchTestDefinition(spec, 'ask'), benchTestDefinition(spec, 'measure')];
    });
}

export function benchLibrary(table: BenchRuleTable): TestLibrary {
    return TestLibrary.fromDefinitions(benchTestDefinitions(table));
}

/** The repair dollars for one rule, for the cost model. */
export function repairUsdFor(table: BenchRuleTable, ruleId: string): number {
    const spec = table.specsById.get(ruleId);
    if (spec === undefined) {
        throw new Error(`LemonadeBench rule table has no repair cost for ${ruleId}`);
    }
    return spec.repairUsd;
}

/** The safety-critical rule ids in the table: the safety gate must run them down before any commit. */
export function safetyCriticalRuleIds(table: BenchRuleTable): string[] {
    return table.rules.filter((rule) => table.specsById.get(rule.id)?.safetyCritical ?? false).map((rule) => rule.id);
}

/**
 * The rule ids whose diagnosis requires a safety stop: the agent must
 * stop work, not just repair. Distinct from safety-critical: replacing
 * brake pads is a safety-critical repair, but it is not a stop order —
 * only a hazard like a fuel leak or an exposed HV cable stops work.
 */
export function stopRuleIds(table: BenchRuleTable): string[] {
    return table.rules.filter((rule) => rule.safetyStop).map((rule) => rule.id);
}

export interface BenchHypotheses {
    priorHypotheses: DiagnosticLoopInput['priorHypotheses'];
    matchedIds: string[];
    nearMissIds: string[];
}

/**
 * The opening differential for one complaint. Matched causes split
 * 0.60, near-miss confusables split 0.25, the rest of the table splits
 * the remaining 0.15 (an empty bucket's share flows to the rest). The
 * loop scales the priors to leave the OTHER floor.
 */
export function benchHypotheses(complaint: string, table: BenchRuleTable): BenchHypotheses {
    const matched = matchingRules(complaint, table.rules);
    if (matched.length === 0) {
        throw new Error(`LemonadeBench proposer found no candidate cause for complaint: ${complaint}`);
    }
    const near = nearMissRules(complaint, table.rules);
    const matchedIds = new Set(matched.map((rule) => rule.id));
    const nearIds = new Set(near.map((rule) => rule.id));
    const background = table.rules.filter((rule) => !matchedIds.has(rule.id) && !nearIds.has(rule.id));
    const matchedShare = 0.6;
    const nearShare = near.length > 0 ? 0.25 : 0;
    const backgroundShare = 1 - matchedShare - nearShare;
    const priorHypotheses = table.rules.map((rule) => {
        const pi = matchedIds.has(rule.id)
            ? matchedShare / matched.length
            : nearIds.has(rule.id)
              ? nearShare / near.length
              : backgroundShare / Math.max(1, background.length);
        return {
            hypothesis: rule.id,
            n: 1,
            pi,
            sources: [{ source: 'lemonade-bench-proposer', observationCount: 1 }],
        };
    });
    return { priorHypotheses, matchedIds: [...matchedIds], nearMissIds: [...nearIds] };
}

/** The rule whose diagnosis matches the recorded expected diagnosis: the case's true cause. */
export function trueRuleIdFor(expectedDiagnosis: string, complaint: string, table: BenchRuleTable): string {
    const candidates = matchingRules(complaint, table.rules);
    for (const rule of candidates) {
        const candidate = {
            ruleId: rule.id,
            diagnosis: rule.diagnosis,
            safetyStop: rule.safetyStop,
            actions: [...rule.actions],
            confidence: 0.85,
        };
        if (diagnosisMatches(expectedDiagnosis, candidate)) {
            return rule.id;
        }
    }
    throw new Error(`LemonadeBench found no rule matching the expected diagnosis: ${expectedDiagnosis}`);
}

/** The snapshot for one recorded case: the true cause's tests are recorded, everything else is invented normal. */
export function benchSnapshot(
    recorded: CaseSnapshot['recorded'],
    table: BenchRuleTable,
    trueRuleId: string,
): CaseSnapshot {
    const actions = recorded.expectedActions;
    return {
        recorded,
        trueHypothesisId: trueRuleId,
        recordedTests: [
            {
                testId: askTestId(trueRuleId),
                outcome: 'positive',
                finding: actions[0] ?? 'Cause confirmed by the tech.',
            },
            {
                testId: measureTestId(trueRuleId),
                outcome: 'positive',
                finding: actions[1] ?? actions[0] ?? 'Cause confirmed by the check.',
            },
        ],
        safetyCriticalHypothesisIds: safetyCriticalRuleIds(table),
    };
}

/** The LM-04 loop input for one snapshot: priors from the complaint, the bench library, no repair costs. */
export function benchLoopInput(
    snapshot: CaseSnapshot,
    table: BenchRuleTable,
    library: TestLibrary,
): DiagnosticLoopInput {
    const complaint = snapshot.recorded.transcript.find((turn) => turn.role === 'user')?.text ?? '';
    const { priorHypotheses } = benchHypotheses(complaint, table);
    return {
        priorHypotheses,
        testDefinitions: library.all(),
        disassemblyState: 'none',
        satisfiedPreconditionIds: [],
        safetyCriticalHypothesisIds: snapshot.safetyCriticalHypothesisIds,
    };
}
