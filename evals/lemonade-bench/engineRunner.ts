// Engine runner (LM-36): drives one snapshot through the LM-04
// diagnostic loop, one gatekeeper answer per round.
//
// The loop plans the next test; the gatekeeper answers it from the
// snapshot (recorded, or an invented normal); the result goes back
// into the loop as a recorded result. The run ends when the loop
// commits to a repair or escalates. The outcome carries everything the
// bench scores: final accuracy, total cost, steps, safety violations,
// process quality, and — for the AutoRepairBench lens — whether the
// fix verified.
import {
    SHARED_CONFIG,
    applyTestResult,
    closeOutLoop,
    createLoop,
    type TestLibrary,
} from '@lemonade/core';
import { benchLoopInput, repairUsdFor, stopRuleIds, type BenchRuleTable } from './benchLibrary';
import { priceRun, type RunCost } from './costModel';
import { scoreProcess, type ProcessGrade, type RoundRecord } from './processScore';
import { SnapshotGatekeeper, type CaseSnapshot, type GatekeeperReading } from './snapshot';

export interface SafetyViolation {
    kind: 'missed-safety-stop' | 'false-safety-stop' | 'unresolved-safety-critical' | 'unsafe-test-ordered';
    detail: string;
}

export interface EngineRunOutcome {
    caseId: string;
    scenarioId: string;
    name: string;
    accurate: boolean;
    finalDiagnosis: string | null;
    committedHypothesisId: string | null;
    decisionKind: string;
    safetyStopCorrect: boolean;
    steps: number;
    rounds: number;
    cost: RunCost;
    process: ProcessGrade;
    safetyViolations: SafetyViolation[];
    autoRepairClosed: boolean;
    testsOrdered: string[];
}

/** The diagnosis text for one rule id, for the report. */
export function diagnosisTextFor(table: BenchRuleTable, ruleId: string): string | null {
    return table.rules.find((rule) => rule.id === ruleId)?.diagnosis ?? null;
}

/** Hard cap on workup rounds the runner will drive; the loop's own round cap escalates first. */
const MAX_RUNNER_ROUNDS = 12;

export function runEngineCase(snapshot: CaseSnapshot, table: BenchRuleTable, library: TestLibrary): EngineRunOutcome {
    const gatekeeper = new SnapshotGatekeeper(snapshot);
    const input = benchLoopInput(snapshot, table, library);
    let state = createLoop(input);
    const openingDifferential = state.differential;
    const rounds: RoundRecord[] = [];
    const readings: GatekeeperReading[] = [];
    const safetyViolations: SafetyViolation[] = [];

    let driven = 0;
    while (state.decision?.kind === 'next-test' && driven < MAX_RUNNER_ROUNDS) {
        driven += 1;
        const next = state.decision.nextTest;
        const definition = library.byId(next.testId);
        if (definition !== undefined) {
            const blockers = library.safetyBlockers(
                definition,
                new Set(state.satisfiedPreconditionIds),
            );
            if (blockers.length > 0) {
                safetyViolations.push({
                    kind: 'unsafe-test-ordered',
                    detail: `Test ${next.testId} was ordered with safety preconditions unmet: ${blockers.map((blocker) => blocker.id).join(', ')}.`,
                });
            }
        }
        const reading = gatekeeper.orderTest(next.testId, next.costTier);
        readings.push(reading);
        state = applyTestResult(state, library, { testId: next.testId, outcome: reading.outcome, source: 'tech' });
        rounds.push({
            round: state.differential.round,
            testId: next.testId,
            outcome: reading.outcome,
            differential: state.differential,
        });
    }

    const decisionKind = state.decision?.kind ?? 'none';
    const committedHypothesisId = state.decision?.kind === 'repair' ? state.decision.hypothesisId : null;
    const leader = state.differential.hypotheses[0];
    const accurate = leader?.id === snapshot.trueHypothesisId;
    const finalDiagnosis = leader === undefined ? null : diagnosisTextFor(table, leader.id);
    const committedIsStop =
        committedHypothesisId !== null && stopRuleIds(table).includes(committedHypothesisId);
    const expectedSafetyStop = snapshot.recorded.expectedSafetyStop;
    const safetyStopCorrect = expectedSafetyStop === committedIsStop;
    if (expectedSafetyStop && !committedIsStop) {
        safetyViolations.push({
            kind: 'missed-safety-stop',
            detail: `Case ${snapshot.recorded.scenarioId} needed a safety stop but the run committed to ${committedHypothesisId ?? 'nothing'}.`,
        });
    }
    if (!expectedSafetyStop && committedIsStop) {
        safetyViolations.push({
            kind: 'false-safety-stop',
            detail: `Case ${snapshot.recorded.scenarioId} needed no stop but the run stopped on ${committedHypothesisId}.`,
        });
    }
    if (state.decision?.kind === 'repair') {
        const releaseLimit = SHARED_CONFIG.DIAGNOSTIC_LOOP.SAFETY_RELEASE_MAX_PROBABILITY;
        const unresolved = state.differential.hypotheses.find(
            (hypothesis) =>
                hypothesis.id !== committedHypothesisId &&
                snapshot.safetyCriticalHypothesisIds.includes(hypothesis.id) &&
                hypothesis.probability > releaseLimit,
        );
        if (unresolved !== undefined) {
            safetyViolations.push({
                kind: 'unresolved-safety-critical',
                detail: `Repair committed while safety-critical ${unresolved.id} was still at ${(unresolved.probability * 100).toFixed(1)}%.`,
            });
        }
    }

    // AutoRepairBench lens: the fix verifies exactly when the committed
    // cause is the true cause; a wrong repair does not hold, and the
    // close-out reopens the loop as an escalation.
    let autoRepairClosed = false;
    if (state.decision?.kind === 'repair') {
        const closed = closeOutLoop(state, leader?.id === snapshot.trueHypothesisId);
        autoRepairClosed = closed.decision?.kind === 'closed';
    }

    const completedTests = state.completedTestIds.flatMap((testId) => {
        const definition = library.byId(testId);
        return definition === undefined ? [] : [definition];
    });
    const repairUsd = committedHypothesisId === null ? 0 : repairUsdFor(table, committedHypothesisId);
    const cost = priceRun(completedTests, library, repairUsd);
    const process = scoreProcess({
        openingDifferential,
        rounds,
        history: state.history,
        orderedTests: readings,
        committedHypothesisId,
        library,
    });

    return {
        caseId: snapshot.recorded.caseId,
        scenarioId: snapshot.recorded.scenarioId,
        name: snapshot.recorded.name,
        accurate,
        finalDiagnosis,
        committedHypothesisId,
        decisionKind,
        safetyStopCorrect,
        steps: readings.length,
        rounds: state.differential.round,
        cost,
        process,
        safetyViolations,
        autoRepairClosed,
        testsOrdered: readings.map((reading) => reading.testId),
    };
}
