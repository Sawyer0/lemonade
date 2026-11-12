// Diagnostic loop engine (LM-04): the pure reducer the machine drives.
//
// One round is one recorded test result: Bayes update, re-rank, re-plan,
// re-evaluate the stop rule. The engine holds no I/O: the caller hands
// it the test library (built from the validated definitions) and the
// recorded results, and gets back the loop state — differential, next
// test, challenger, decision — plus a text summary the live agent can
// read from the shared case record.
import { SHARED_CONFIG } from '../../config';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import { TestLibrary } from '../tests/testLibrary';
import type { TestDefinition } from '../tests/testSchema';
import { buildDifferential } from './hypotheses';
import { bayesUpdate, type TestRates } from './update';
import { planNextTest, testCostUsd, type PlanResult } from './planner';
import { evaluateStop } from './stop';
import type { DiagnosticLoopInput, DiagnosticLoopState, LoopDecision, TestResultInput } from './types';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

/** The effective rates the planner and update share: verified rates pass through, drafts were shrunk in the library. */
export function libraryRates(library: TestLibrary): (test: TestDefinition, hypothesisId: string) => TestRates {
    return (test, hypothesisId) => library.effectiveRates(test, hypothesisId);
}

/** Re-plans and re-evaluates the stop rule for a loop state, without applying a new result. */
export function planLoop(state: DiagnosticLoopState, library: TestLibrary): DiagnosticLoopState {
    const rates = libraryRates(library);
    const plan: PlanResult = planNextTest(state.differential, library, plannerStateFrom(state), rates);
    return { ...state, decision: evaluateStop(state, { plan }) };
}

/** The planner's view of a loop state: sets, not arrays. */
export function plannerStateFrom(state: DiagnosticLoopState): {
    disassemblyState: DiagnosticLoopState['disassemblyState'];
    satisfiedPreconditionIds: ReadonlySet<string>;
    completedTestIds: ReadonlySet<string>;
    techAsksRemaining?: number;
} {
    return {
        disassemblyState: state.disassemblyState,
        satisfiedPreconditionIds: new Set(state.satisfiedPreconditionIds),
        completedTestIds: new Set(state.completedTestIds),
        // LM-29: the ask budget the planner enforces. No bound budget
        // means no cap, so the key stays absent.
        ...(state.budget
            ? { techAsksRemaining: state.budget.maxTechAsks - state.techAsksUsed }
            : {}),
    };
}

/** Builds the opening loop state and runs the recorded results through it, one round each. */
export function createLoop(input: DiagnosticLoopInput): DiagnosticLoopState {
    const library = TestLibrary.fromDefinitions(input.testDefinitions);
    let state: DiagnosticLoopState = {
        differential: buildDifferential(input),
        disassemblyState: input.disassemblyState ?? 'none',
        satisfiedPreconditionIds: input.satisfiedPreconditionIds ?? [],
        spentUsd: 0,
        budgetUsd: input.budgetUsd ?? LOOP.DEFAULT_BUDGET_USD,
        safetyCriticalHypothesisIds: input.safetyCriticalHypothesisIds ?? [],
        repairCostsUsd: input.repairCostsUsd ?? {},
        completedTestIds: [],
        history: [],
        decision: null,
        techAsksUsed: 0,
        spentTestMinutes: 0,
        budget: input.budget,
    };
    for (const result of input.recordedResults ?? []) {
        state = applyTestResult(state, library, result);
    }
    return planLoop(state, library);
}

/**
 * Applies one recorded result: Bayes update, spend the test's cost,
 * re-plan, re-evaluate. Throws when the test id is unknown to the
 * library: an unrecordable result must fail loudly.
 */
export function applyTestResult(
    state: DiagnosticLoopState,
    library: TestLibrary,
    result: TestResultInput,
): DiagnosticLoopState {
    const test = library.byId(result.testId);
    if (!test) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, `Unknown test in loop result: ${result.testId}`);
    }
    const { differential, trace } = bayesUpdate(state.differential, test, result, libraryRates(library));
    const spent = state.spentUsd + testCostUsd(test, library).totalUsd;
    // LM-29: a recorded result charges the test. An 'ask' test charges one
    // tech ask as well as its labor minutes; every test charges minutes.
    const spentTestMinutes = state.spentTestMinutes + test.cost.laborMinutes;
    const techAsksUsed = state.techAsksUsed + (test.costTier === 'ask' ? 1 : 0);
    return planLoop(
        {
            ...state,
            differential,
            spentUsd: spent,
            techAsksUsed,
            spentTestMinutes,
            completedTestIds: [...state.completedTestIds, test.id],
            history: [...state.history, ...trace],
        },
        library,
    );
}

/**
 * Close-out: only after the fix is verified (LM-03: complaint gone, code
 * does not return). A failed verification reopens the loop as an
 * escalation — the repair did not hold, and the differential that
 * committed to it is no longer trustworthy.
 */
export function closeOutLoop(state: DiagnosticLoopState, verifyFixPassed: boolean): DiagnosticLoopState {
    if (state.decision?.kind !== 'repair' && state.decision?.kind !== 'verify-fix') {
        throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Close-out needs a repair decision first: the loop has not committed to a fix.',
        );
    }
    const hypothesisId = state.decision.hypothesisId;
    if (!verifyFixPassed) {
        return {
            ...state,
            decision: {
                kind: 'escalate',
                reason: 'evidence-inconsistent',
                detail: `The fix for ${hypothesisId} did not verify: the complaint or the code returned.`,
            },
        };
    }
    return { ...state, repairedHypothesisId: hypothesisId, decision: { kind: 'closed', hypothesisId } };
}

/** The loop is terminal once it commits, escalates, or closes. */
export function loopIsTerminal(state: DiagnosticLoopState): boolean {
    return state.decision !== null && state.decision.kind !== 'next-test';
}

/** Renders the differential, next step, challenger, and decision as text, for the live agent's context (LM-21). */
export function renderLoopSummary(state: DiagnosticLoopState): string {
    const lines: string[] = ['Diagnostic loop:'];
    for (const hypothesis of state.differential.hypotheses) {
        lines.push(
            `- ${hypothesis.label}: ${(hypothesis.probability * 100).toFixed(1)}% [${hypothesis.source}; ${hypothesis.provenance.join(', ') || 'no provenance'}]`,
        );
    }
    lines.push(`- OTHER (unlisted cause): ${(state.differential.otherProbability * 100).toFixed(1)}%`);
    lines.push(
        `Round ${state.differential.round}, spent $${state.spentUsd.toFixed(0)} of $${state.budgetUsd.toFixed(0)}.`,
    );
    // LM-29: the per-case counters the benchmark reports (LM-22 reads them
    // from the loop state; the line here is the human-readable form).
    lines.push(
        state.budget
            ? `Tech asks used ${state.techAsksUsed} of ${state.budget.maxTechAsks}; test minutes spent ${state.spentTestMinutes} of ${state.budget.maxTestCostMinutes}.`
            : `Tech asks used ${state.techAsksUsed}; test minutes spent ${state.spentTestMinutes}.`,
    );
    const decision: LoopDecision | null = state.decision;
    if (decision?.kind === 'next-test') {
        const next = decision.nextTest;
        lines.push(
            `Next test: ${next.title} (${next.testId}) — $${next.cost.totalUsd.toFixed(0)}, expected value ${next.expectedValuePerDollar.toFixed(4)} resolved per dollar.`,
        );
        for (const spoken of next.spoken) {
            lines.push(`  ${spoken}`);
        }
        if (decision.challenger) {
            lines.push(
                `Challenger (could disprove the leader): ${decision.challenger.title} — $${decision.challenger.cost.totalUsd.toFixed(0)}.`,
            );
        }
    } else if (decision?.kind === 'repair') {
        lines.push(`Commit to repair: ${decision.hypothesisId}. ${decision.reason}`);
    } else if (decision?.kind === 'escalate') {
        lines.push(`Escalate (${decision.reason}): ${decision.detail}`);
    } else if (decision?.kind === 'verify-fix') {
        lines.push(`Verify the fix for ${decision.hypothesisId}: complaint gone, code does not return.`);
    } else if (decision?.kind === 'closed') {
        lines.push(`Closed: fix for ${decision.hypothesisId} verified.`);
    }
    return lines.join('\n');
}
