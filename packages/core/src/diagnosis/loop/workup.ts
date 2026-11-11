// Machine glue (LM-04): the mechanic machine's `workup` state drives
// the loop through these two functions and nothing else, so the state
// chart stays thin and the math stays testable in the loop module.
import { TestLibrary } from '../tests/testLibrary';
import type { TestDefinition } from '../tests/testSchema';
import { applyTestResult, createLoop, planLoop } from './loop';
import type { DiagnosticLoopInput, DiagnosticLoopState, TestResultInput } from './types';

export interface WorkupEntry {
    loop: DiagnosticLoopState | null;
    definitions: TestDefinition[];
}

/**
 * Workup entry: an existing loop state is re-planned against its stored
 * definitions (a snapshot restore, or a result that just landed); fresh
 * input starts a new loop and runs its recorded results. No input and no
 * existing state means no loop: the workup is skipped.
 */
export function enterWorkup(
    existing: DiagnosticLoopState | null,
    definitions: TestDefinition[],
    input?: DiagnosticLoopInput,
): WorkupEntry {
    if (existing) {
        return { loop: planLoop(existing, TestLibrary.fromDefinitions(definitions)), definitions };
    }
    if (!input) {
        return { loop: null, definitions: [] };
    }
    const loop = createLoop(input);
    return { loop, definitions: input.testDefinitions };
}

/**
 * Applies one recorded result inside the machine. An unknown test id
 * fails soft here — the loop state is unchanged and the error is
 * returned for the machine to record — because a bad result from the
 * live agent must not kill the diagnosis run.
 */
export function applyWorkupResult(
    state: DiagnosticLoopState,
    definitions: TestDefinition[],
    result: TestResultInput,
): { state: DiagnosticLoopState; error?: string } {
    try {
        return { state: applyTestResult(state, TestLibrary.fromDefinitions(definitions), result) };
    } catch (error) {
        return { state, error: error instanceof Error ? error.message : String(error) };
    }
}
