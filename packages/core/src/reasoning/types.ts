import type { ToolContext, ToolRegistry, ToolResult } from '../tools';
import type { SandboxStagedFile } from '../ports/ISandbox';

/** Recorded scan data the reasoner computes over: a freeze frame and a PID log. */
export interface ReasonerScanData {
    freezeFrame?: Record<string, unknown>;
    pidLog?: Array<Record<string, unknown>>;
}

export interface ReasonerRunRequest {
    caseId: string;
    sessionId: string;
    userId: string;
    goal: string;
    caseFiles: SandboxStagedFile[];
}

/**
 * What a reasoner run stores for its caller: a loop result, or `skipped`
 * when the run did not happen (no runner bound, no sandbox available). The
 * loop itself only ever ends in its five named states; `skipped` is a
 * caller-boundary state, not a loop outcome.
 */
export type ReasonerRegionResult =
    ReasonerLoopResult | { endState: 'skipped'; endReason: string; steps: []; citations: [] };

/** What the mechanic machine's `runReasoner` actor needs: one loop run for a case. */
export interface ReasonerActorRunner {
    run(request: ReasonerRunRequest): Promise<ReasonerRegionResult>;
}

/** The five named states a reasoner loop can end in (LM-16). */
export const REASONER_END_STATES = ['finished', 'needs_tech', 'safety_stop', 'budget', 'max_steps'] as const;
export type ReasonerEndState = (typeof REASONER_END_STATES)[number];

export interface ReasonerToolAction {
    kind: 'tool';
    tool: string;
    args: Record<string, unknown>;
}

export interface ReasonerFinishAction {
    kind: 'finish';
    /** What the reasoner concluded, in its own words. */
    summary: string;
    /** Sandbox outputs (or workdir files) the conclusion cites. */
    citations: string[];
}

export interface ReasonerNeedsTechAction {
    kind: 'needs_tech';
    reason: string;
}

export interface ReasonerSafetyStopAction {
    kind: 'safety_stop';
    reason: string;
}

export type ReasonerAction =
    ReasonerToolAction | ReasonerFinishAction | ReasonerNeedsTechAction | ReasonerSafetyStopAction;

/** One loop step, as the model sees it on the next turn. */
export interface ReasonerStepRecord {
    step: number;
    action: ReasonerAction;
    /** Present for tool actions: what the tool returned. */
    toolResult?: ToolResult;
}

export interface ReasonerModelInput {
    /** What the loop is trying to establish, e.g. `compute fuel trims from the PID log`. */
    goal: string;
    tools: Array<{ name: string; description: string; side: string }>;
    transcript: ReasonerStepRecord[];
    step: number;
    maxSteps: number;
}

/**
 * The model behind the loop. Implementations ask the model for the next
 * action given the goal, the tools it may call, and the transcript so far.
 * A throwing model aborts the loop: a model failure is an infrastructure
 * failure, not a diagnosis outcome, so it propagates instead of mapping to
 * a named end state.
 */
export interface ReasonerModel {
    nextAction(input: ReasonerModelInput): Promise<ReasonerAction>;
}

export interface ReasonerLoopConfig {
    /** Max tool steps before the loop ends in `max_steps`. Default 12. */
    maxSteps?: number;
    /** Same tool failing this many times with the same arguments ends the loop in `budget`. Default 3. */
    maxRepeatedFailures?: number;
    /** Same tool called this many times with the same arguments ends the loop in `budget` (stuck). Default 3. */
    maxRepeatedActions?: number;
}

export interface ReasonerLoopResult {
    endState: ReasonerEndState;
    /** Why the loop ended in this state, for the ledger and the tech. */
    endReason: string;
    steps: ReasonerStepRecord[];
    /** Present when the loop finished: the model's conclusion. */
    finishSummary?: string;
    /** Sandbox outputs the conclusion cites. */
    citations: string[];
}

export interface RunReasonerLoopInput {
    model: ReasonerModel;
    tools: ToolRegistry;
    goal: string;
    /** Passed to every tool call (case, session, user). */
    toolContext?: ToolContext;
    config?: ReasonerLoopConfig;
}
