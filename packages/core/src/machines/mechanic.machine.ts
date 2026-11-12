import { setup, fromPromise, assign } from 'xstate';
import type { FinalDiagnosis, NeurosymbolicState } from '../types/neurosymbolic';
import type { CaseGoal, GoalPhase } from '../goal/goalSchema';
import {
    EMPTY_BUDGET_USAGE,
    evaluatePhase,
    resolveTerminalStatus,
    type BudgetUsage,
    type SafetyStopSignal,
    type TerminalGoalStatus,
} from '../goal/phaseGate';
import type { LedgerEntry } from '../types/case';
import type { AbstainHandoff, ChallengerObjection, FinishGateRunResult } from '../diagnosis/finishGate';
import { buildAbstainHandoff } from '../diagnosis/finishGate';
import type { CaseEvidence } from '../case/CaseRunQueue';
import type { ReasonerRegionResult, ReasonerScanData } from '../reasoning/types';
import type { IMultimodalUploadAnalyzer, IChatAssistantAI } from '../interfaces/IAIService';
import type { INHTSAService } from '../interfaces/INHTSAService';
import type { IVectorRepository } from '../interfaces/IVectorRepository';
import type { IGoogleSearchService } from '../interfaces/IGoogleSearchService';
import type { IMemoryService, MemorySearchResult } from '../interfaces/IMemoryService';
import type { AIAnalysis, SafetyRecall, VectorDocument } from '../types/models';
import type { ParsedDtc } from '../dtc/types';
import type { VerificationRequest, VerificationResponse, SearchRequest, SearchResponse } from '../types/verification';
import type { LocalTriageResult } from '../types/localPerception';
import type { TestDefinition } from '../diagnosis/tests/testSchema';
import type { DiagnosticLoopInput, DiagnosticLoopState, LoopDecision, TestResultInput } from '../diagnosis/loop/types';
import { loopIsTerminal } from '../diagnosis/loop/loop';
import { enterWorkup, applyWorkupResult } from '../diagnosis/loop/workup';

export interface VisionInput {
    service: IMultimodalUploadAnalyzer;
    data: MechanicContext & {
        searchContext: SearchResponse | undefined;
        verificationContext: VerificationResponse | undefined;
    };
}
export interface NhtsaInput {
    service: INHTSAService;
    data: { year: number; make: string; model: string };
}
export interface VectorInput {
    service: IVectorRepository;
    data: { query: string; userId: string };
}
export interface SearchInput {
    service: IGoogleSearchService;
    data: SearchRequest;
}
export interface VerificationInput {
    service: IChatAssistantAI;
    data: VerificationRequest;
}
export interface MemoryInput {
    service: IMemoryService;
    data: { query: string; userId: string; vin?: string };
}
export interface GatherAllContextInput {
    services: MechanicServices;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    userId: string;
}
export interface GatherAllContextOutput {
    recalls: SafetyRecall[];
    history: MemorySearchResult[];
    vectors: VectorDocument[];
}

export interface MechanicInput {
    sessionId: string;
    userId: string;
    vehicleContext: Record<string, unknown>;
    userQuery: string;
    videoUrl?: string;
    videoDuration?: number;
    services: MechanicServices;
    localTriage?: LocalTriageResult;
    // Parsed DTCs for this session (LM-02). The machine never invents a code
    // meaning: these come from the deterministic parser, via the session.
    dtcCodes?: ParsedDtc[];
    // Evidence queued before the run started (LM-17): folded into the first
    // model call. Evidence that arrives mid-run joins through APPEND_EVIDENCE.
    queuedEvidence?: CaseEvidence[];
    // Case this diagnosis belongs to (LM-17 run queue, LM-16 reasoner).
    caseId?: string;
    // Recorded scan data for the reasoner loop (LM-16). Without it the
    // `investigating` state's reasoner region completes immediately.
    scanData?: ReasonerScanData;
    // Decision-theoretic workup (LM-04): priors, the test library, and
    // results already recorded. Without it the `workup` state completes
    // immediately and the diagnosis runs as before.
    diagnosticLoopInput?: DiagnosticLoopInput;
    // Case goal (LM-26): the machine-checkable definition of done for this
    // case. Phases advance only when the goal's blocking criteria for the
    // phase are met (evaluateGoal over the ledger). Without a goal the
    // machine runs as before and settles as diagnosed_unverified.
    goal?: CaseGoal;
    // Case ledger the phase guards and the finish gate evaluate (LM-26,
    // LM-19): the evidence so far. The machine never mints entries — the
    // caller appends real ones with APPEND_LEDGER_ENTRY as the run (or
    // the case) records them.
    ledger?: LedgerEntry[];
    // Whether the caller's ledger read failed (LM-19): the case exists
    // but its ledger could not be read, so the finish gate must abstain
    // instead of skipping. False (or absent) means the ledger is
    // genuinely empty — no case, or a still-empty case — and the gate
    // skips as before.
    ledgerReadFailed?: boolean;
    // Budget already spent on this case (LM-26): the machine counts its
    // own reasoner runs and test minutes on top of this.
    budgetUsage?: BudgetUsage;
}

export interface MechanicContext extends MechanicInput {
    nhtsaResults: SafetyRecall[];
    embeddingInfo: VectorDocument[];
    vehicleHistory: MemorySearchResult[];
    visualAnalysis?: AIAnalysis;
    searchResults?: SearchResponse;
    verificationResult?: VerificationResponse;
    result?: NeurosymbolicState;
    error?: string;
    localTriage?: LocalTriageResult;
    dtcCodes: ParsedDtc[];
    // Evidence that arrived after the run started, folded in at checkpoints
    // (LM-17). The intuition model call reads this when its state is entered,
    // so evidence queued during context gathering reaches the first model call.
    queuedEvidence: CaseEvidence[];
    // LM-17: the invoking state a RESUME round trip returns to. Set by the
    // RESUME transition of that state, read by the transient `resuming` state.
    resumeTarget?: ResumeTarget;
    // LM-16: the reasoner loop's outcome, when the `investigating` state's
    // reasoner region ran (scan data present and a runner bound). Absent
    // when the region completed without running.
    reasonerResult?: ReasonerRegionResult;
    // LM-04: the workup loop's state — ranked differential, next test,
    // challenger, decision — exposed to the live agent through the shared
    // case record, and the test definitions it plans against (plain data,
    // so a stored snapshot round-trips).
    diagnosticLoop?: DiagnosticLoopState | null;
    loopTestDefinitions?: TestDefinition[];
    // LM-26: the goal driving this run, the ledger the phase guards and
    // the finish gate read, the budget spent so far, and the phase the run
    // is in. The goal and ledger are plain data, so a stored snapshot
    // round-trips them and a restart resumes in the same phase with the
    // same goal version.
    goal: CaseGoal | undefined;
    ledger: LedgerEntry[];
    // LM-19: whether the ledger read failed. Plain data, so a stored
    // snapshot round-trips it and a restart abstains the same way.
    ledgerReadFailed: boolean;
    budgetUsage: BudgetUsage;
    phase: GoalPhase;
    // LM-26: the one named terminal status the run settled in, and why.
    // Set on entry to `settling`; the six final states below read it.
    terminalStatus: TerminalGoalStatus | undefined;
    terminalReason: string | undefined;
    // LM-26: a safety stop raised during the run, or an abstain handoff
    // from the finish gate (LM-19). Either settles the run with that
    // status. The handoff is the one rich shape the machine uses
    // (confirmed, ruled out, next test, when to escalate), defined with
    // the gate that produces it.
    safetyStop: SafetyStopSignal | undefined;
    abstain: AbstainHandoff | undefined;
    // LM-19: the finish gate's attempts used so far, the objections from
    // the last attempt, and — on a pass — the gated diagnosis the service
    // speaks instead of re-synthesizing one.
    gateAttempts: number;
    gateObjections: ChallengerObjection[];
    gateReasons: string[];
    gatedDiagnosis?: FinalDiagnosis;
}

/** Invoking states a crash resume can re-enter (LM-17). */
export type ResumeTarget =
    'gathering_context' | 'intuition' | 'workup' | 'investigating' | 'vision_verifying' | 'gating';

/** Input to the `runFinishGate` actor (LM-19). */
export interface FinishGateInput {
    visual?: AIAnalysis;
    recalls: SafetyRecall[];
    similar: unknown[];
    verification?: VerificationResponse;
    searchQueryUsed: string | null;
    localTriage?: LocalTriageResult;
    dtcCodes: ParsedDtc[];
    ledger: LedgerEntry[];
    // True when the case exists but its ledger could not be read: the
    // actor abstains instead of skipping, so a failed read never
    // silently disables the gate.
    ledgerReadFailed: boolean;
    loopState?: DiagnosticLoopState | null;
    loopDecision?: LoopDecision | null;
    testDefinitions?: TestDefinition[];
    attempt: number;
    sessionId: string;
}

/**
 * Turns a failed attempt's objections into evidence the next attempt's
 * intuition call reads: the reasoner revises with the critique as
 * feedback, instead of re-judging the same candidate.
 */
function objectionsAsEvidence(objections: ChallengerObjection[], attempt: number): CaseEvidence[] {
    return objections.map((objection, index) => ({
        id: `finish-gate-attempt-${attempt}-objection-${index}`,
        kind: 'answer' as const,
        summary: `Finish gate objection: ${objection.text}`,
        receivedAt: new Date(),
    }));
}

/** The machine's final states: exactly one named terminal status per run (LM-26). */
export const TERMINAL_MECHANIC_STATES: ReadonlyArray<TerminalGoalStatus> = [
    'verified_fix',
    'diagnosed_unverified',
    'abstained',
    'safety_stopped',
    'escalated',
    'budget_limited',
];

/** Whether a machine state value is one of the terminal states (LM-26). */
export function isMechanicTerminalState(value: unknown): value is TerminalGoalStatus {
    return typeof value === 'string' && (TERMINAL_MECHANIC_STATES as ReadonlyArray<string>).includes(value);
}

export interface MechanicServices {
    vision: IMultimodalUploadAnalyzer;
    nhtsa: INHTSAService;
    vector: IVectorRepository;
    chat: IChatAssistantAI;
    search: IGoogleSearchService;
    memory: IMemoryService;
}

export type MechanicEvent =
    | {
          type: 'DIAGNOSE';
          userId: string;
          sessionId: string;
          vehicleContext: Record<string, unknown>;
          userQuery: string;
          videoUrl?: string;
          videoDuration?: number;
          localTriage?: LocalTriageResult;
          dtcCodes?: ParsedDtc[];
          caseId?: string;
          scanData?: ReasonerScanData;
          diagnosticLoopInput?: DiagnosticLoopInput;
          // Case goal, ledger, and budget spent so far (LM-26). A run
          // started without them settles as diagnosed_unverified.
          goal?: CaseGoal;
          ledger?: LedgerEntry[];
          ledgerReadFailed?: boolean;
          budgetUsage?: BudgetUsage;
      }
    | { type: 'UPDATE_SERVICES'; services: MechanicServices }
    // LM-26: sets the goal for the run, in idle only. The goal version in
    // context is the version the run is judged against; a restart restores
    // it from the snapshot, never from a newer goal.
    | { type: 'SET_GOAL'; goal: CaseGoal; ledger?: LedgerEntry[] }
    // LM-26: appends one real ledger entry to the guards' view, as the run
    // or the case records it. An entry already present (same id) is
    // ignored, so a re-delivered append cannot double-count evidence.
    | { type: 'APPEND_LEDGER_ENTRY'; entry: LedgerEntry }
    // LM-26: the judge abstains (LM-19 sends this): the run settles as
    // abstained with the handoff. Handled at the root so it lands in any
    // phase. The handoff is the one rich shape the machine uses: what the
    // ledger confirmed, what was ruled out, the next test, and when a
    // human must take over.
    | {
          type: 'ABSTAIN';
          reason: string;
          confirmed: string[];
          ruledOut: string[];
          nextTest: string | null;
          escalateWhen: string;
      }
    // LM-26: a safety stop raised during the run (LM-20's hook): the run
    // settles as safety_stopped. Handled at the root so it lands in any phase.
    | { type: 'SAFETY_STOP'; reason: string; hazard?: string }
    // LM-17 checkpoint steering: appends one piece of queued evidence to the
    // run. Handled at the machine root so it lands in any state, including
    // after a snapshot restore; it never interrupts a running tool call.
    | { type: 'APPEND_EVIDENCE'; evidence: CaseEvidence }
    // LM-17 crash resume: re-enters the state the run was restored in, so
    // the invoked actor that died with the worker starts again. A restored
    // promise actor never re-executes on its own, so without this the run
    // would sit in its restored state forever. Each invoking state answers
    // RESUME by exiting to the transient `resuming` state, which immediately
    // re-enters the recorded state: a self-target transition is internal in
    // XState v5 and would not restart the invocation, so the round trip
    // through `resuming` is what forces the re-entry. Idle and synthesizing
    // ignore it.
    | { type: 'RESUME' }
    // LM-04 workup: a recorded test result re-ranks the differential and
    // re-plans the next test. Handled in the `workup` state; sent anywhere
    // else it is ignored. END_WORKUP leaves the workup for repair
    // guidance with the current plan in context.
    | {
          type: 'RECORD_TEST_RESULT';
          testId: string;
          outcome: TestResultInput['outcome'];
          source?: TestResultInput['source'];
      }
    | { type: 'END_WORKUP' };

export interface IntuitionInput {
    userQuery: string;
    vehicleContext: Record<string, unknown>;
    nhtsaResults: SafetyRecall[];
    vehicleHistory: MemorySearchResult[];
    videoUrl?: string;
    userId: string;
    sessionId: string;
    // Evidence queued before this model call (LM-17 checkpoint input).
    queuedEvidence: CaseEvidence[];
}

/** Input to the `runReasoner` actor (LM-16). */
export interface ReasonerInput {
    caseId?: string;
    sessionId: string;
    userId: string;
    scanData: ReasonerScanData;
}

/** Input to the `prepareDiagnosticLoop` actor (LM-04). */
export interface PrepareLoopInput {
    vehicleContext: Record<string, unknown>;
    dtcCodes: ParsedDtc[];
    userId: string;
    sessionId: string;
}

export const mechanicMachine = setup({
    types: {
        context: {} as MechanicContext,
        events: {} as MechanicEvent,
        input: {} as MechanicInput,
    },
    actions: {
        loadVisionModel: () => {}, // Conceptual: Implementation provided by consumer (Server/Client)
        unloadVisionModel: () => {}, // Conceptual: Implementation provided by consumer (Server/Client)
    },
    actors: {
        generateIntuition: fromPromise<AIAnalysis, IntuitionInput>(async () => {
            throw new Error('generateIntuition implementation missing');
        }), // To be provided in service
        visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) =>
            input.service.analyzeUploadedVideo(
                input.data.videoUrl!,
                JSON.stringify(input.data.vehicleContext),
                'video/mp4',
                input.data.userId,
                input.data.sessionId,
                undefined,
                input.data.videoDuration,
            ),
        ),
        nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) =>
            input.service.checkRecalls(input.data.year, input.data.make, input.data.model),
        ),
        vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
            return input.service.search(input.data.query, 3, { userId: input.data.userId });
        }),
        googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
            return input.service.search(input.data);
        }),
        webVerification: fromPromise(async ({ input }: { input: VerificationInput }) => {
            return input.service.verifyHypothesis(input.data);
        }),
        supermemorySearch: fromPromise(async ({ input }: { input: MemoryInput }) => {
            return input.service.search(
                `Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`,
                {
                    tags: [`user:${input.data.userId}`, `vin:${input.data.vin || 'unknown'}`],
                },
            );
        }),
        gatherAllContext: fromPromise<GatherAllContextOutput, GatherAllContextInput>(async () => {
            throw new Error('gatherAllContext implementation missing'); // To be provided in service
        }),
        // LM-16: the reasoner loop. The default resolves `skipped`: the loop
        // is optional by design — without scan data or a bound runner the
        // diagnosis runs as before, and the region completes immediately.
        // The service provides the real actor via createMechanicActors.
        runReasoner: fromPromise<ReasonerRegionResult, ReasonerInput>(async () => ({
            endState: 'skipped',
            endReason: 'runReasoner implementation missing',
            steps: [],
            citations: [],
        })),
        // LM-04: the workup's loop input — priors plus the test library.
        // The default resolves null, so without a bound preparer the
        // workup completes immediately and the diagnosis runs as before.
        // The service provides the real actor via createMechanicActors.
        prepareDiagnosticLoop: fromPromise<DiagnosticLoopInput | null, PrepareLoopInput>(async () => null),
        // LM-19: the challenger + checklist + independent finish gate.
        // The default resolves `skipped`: without a bound gate the
        // diagnosis runs as before, and the service falls back to its own
        // synthesis. The service provides the real actor via
        // createMechanicActors.
        runFinishGate: fromPromise<FinishGateRunResult, FinishGateInput>(async () => ({
            passed: false,
            outcome: 'skipped',
            objections: [],
            checklistFailures: [],
            reasons: [],
        })),
    },
}).createMachine({
    id: 'mechanic',
    initial: 'idle',
    context: ({ input }) => ({
        ...input,
        sessionId: input.sessionId,
        userId: input.userId,
        vehicleContext: input.vehicleContext,
        userQuery: input.userQuery,
        videoUrl: input.videoUrl,
        videoDuration: input.videoDuration,
        services: input.services,
        dtcCodes: input.dtcCodes ?? [],
        queuedEvidence: input.queuedEvidence ?? [],
        caseId: input.caseId,
        scanData: input.scanData,
        diagnosticLoopInput: input.diagnosticLoopInput,
        diagnosticLoop: null,
        loopTestDefinitions: [],
        goal: input.goal,
        ledger: input.ledger ?? [],
        ledgerReadFailed: input.ledgerReadFailed ?? false,
        budgetUsage: input.budgetUsage ?? { ...EMPTY_BUDGET_USAGE },
        phase: 'intake',
        terminalStatus: undefined,
        terminalReason: undefined,
        safetyStop: undefined,
        abstain: undefined,
        gateAttempts: 0,
        gateObjections: [],
        gateReasons: [],
        nhtsaResults: [],
        embeddingInfo: [],
        vehicleHistory: [],
    }),
    // Root-level events, handled in every state. UPDATE_SERVICES lives here
    // (not only in idle) so a snapshot-restored actor can receive live
    // services in whatever state it resumes in; APPEND_EVIDENCE is the
    // checkpoint steering event (LM-17). ABSTAIN and SAFETY_STOP (LM-26)
    // settle the run from any phase: a safety stop or an abstention ends
    // the run honestly instead of letting it advance on hope.
    on: {
        UPDATE_SERVICES: {
            actions: assign(({ event }) => {
                if ('services' in event) {
                    return { services: event.services };
                }
                return {};
            }),
        },
        APPEND_EVIDENCE: {
            actions: assign(({ context, event }) => {
                if (event.type === 'APPEND_EVIDENCE') {
                    return { queuedEvidence: [...context.queuedEvidence, event.evidence] };
                }
                return {};
            }),
        },
        APPEND_LEDGER_ENTRY: {
            actions: assign(({ context, event }) => {
                if (event.type === 'APPEND_LEDGER_ENTRY') {
                    if (context.ledger.some((entry) => entry.id === event.entry.id)) {
                        return {};
                    }
                    return { ledger: [...context.ledger, event.entry] };
                }
                return {};
            }),
        },
        ABSTAIN: {
            target: '#mechanic.settling',
            actions: assign(({ event }) => {
                if (event.type === 'ABSTAIN') {
                    return {
                        abstain: {
                            reason: event.reason,
                            confirmed: event.confirmed,
                            ruledOut: event.ruledOut,
                            nextTest: event.nextTest,
                            escalateWhen: event.escalateWhen,
                        },
                    };
                }
                return {};
            }),
        },
        SAFETY_STOP: {
            target: '#mechanic.settling',
            actions: assign(({ event }) => {
                if (event.type === 'SAFETY_STOP') {
                    return {
                        safetyStop: {
                            reason: event.reason,
                            ...(event.hazard !== undefined ? { hazard: event.hazard } : {}),
                        },
                    };
                }
                return {};
            }),
        },
    },
    states: {
        idle: {
            on: {
                SET_GOAL: {
                    actions: assign(({ event }) => {
                        if (event.type === 'SET_GOAL') {
                            return {
                                goal: event.goal,
                                ...(event.ledger !== undefined ? { ledger: event.ledger } : {}),
                            };
                        }
                        return {};
                    }),
                },
                DIAGNOSE: {
                    target: 'gathering_context',
                    actions: assign(({ event, context }) => {
                        if (event.type === 'DIAGNOSE') {
                            return {
                                sessionId: event.sessionId,
                                userId: event.userId,
                                vehicleContext: event.vehicleContext,
                                userQuery: event.userQuery,
                                videoUrl: event.videoUrl,
                                videoDuration: event.videoDuration,
                                localTriage: event.localTriage,
                                dtcCodes: event.dtcCodes ?? [],
                                caseId: event.caseId,
                                scanData: event.scanData,
                                diagnosticLoopInput: event.diagnosticLoopInput ?? context.diagnosticLoopInput,
                                goal: event.goal ?? context.goal,
                                ledger: event.ledger ?? context.ledger,
                                ledgerReadFailed: event.ledgerReadFailed ?? context.ledgerReadFailed,
                                budgetUsage: event.budgetUsage ?? context.budgetUsage,
                                phase: 'intake' as const,
                                terminalStatus: undefined,
                                terminalReason: undefined,
                                safetyStop: undefined,
                                abstain: undefined,
                                gateAttempts: 0,
                                gateObjections: [],
                                gateReasons: [],
                                gatedDiagnosis: undefined,
                            };
                        }
                        return {};
                    }),
                },
            },
        },
        gathering_context: {
            description:
                'Step 1: Gather Facts (Recalls & History) BEFORE Intuition - Using Promise.all workaround for XState parallel bug',
            // LM-26: the intake phase. Both exits go through the intake
            // gate: the run advances only when the goal's intake criteria
            // are met (vacuously when the goal has none).
            entry: assign({ phase: 'intake' as const }),
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this state and restarts the invoked gather actor.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'gathering_context' as const }) } },
            invoke: {
                src: 'gatherAllContext',
                input: ({ context }: { context: MechanicContext }) => ({
                    services: context.services,
                    vehicleContext: context.vehicleContext,
                    userQuery: context.userQuery,
                    userId: context.userId,
                }),
                onDone: {
                    target: 'intake_gate',
                    actions: [
                        assign({
                            nhtsaResults: ({ event }) => event.output.recalls,
                            vehicleHistory: ({ event }) => event.output.history,
                            embeddingInfo: ({ event }) => event.output.vectors,
                        }),
                    ],
                },
                onError: {
                    target: 'intake_gate', // Continue even on error
                    actions: [assign({ error: ({ event }) => String(event.error) })],
                },
            },
        },
        // LM-26: phase gates. Each is transient: it judges the phase just
        // finished against the goal (evaluateGoal over the ledger) and
        // either advances to the next phase's work or settles the run, so
        // no phase starts on hope. A run with no goal, or a phase with no
        // blocking criteria, passes vacuously.
        intake_gate: {
            description: 'LM-26: intake gate — the goal’s intake criteria must be met to differentiate',
            always: [
                {
                    target: 'intuition',
                    guard: ({ context }) =>
                        context.goal === undefined || evaluatePhase(context.goal, context.ledger, 'intake').met,
                },
                { target: 'settling' },
            ],
        },
        intuition: {
            description: 'Step 2: Formulate Hypothesis (ASE Master Tech) using gathered context',
            // LM-26: the differentiate phase starts here.
            entry: assign({ phase: 'differentiate' as const }),
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this state and restarts the invoked model call.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'intuition' as const }) } },
            invoke: {
                // This actor is defined in MechanicReasoningService.ts
                src: 'generateIntuition',
                input: ({ context }: { context: MechanicContext }) => ({
                    userQuery: context.userQuery,
                    vehicleContext: context.vehicleContext,
                    nhtsaResults: context.nhtsaResults,
                    vehicleHistory: context.vehicleHistory,
                    videoUrl: context.videoUrl,
                    userId: context.userId,
                    sessionId: context.sessionId,
                    // Checkpoint: evidence queued during gathering reaches the
                    // model call because the input is built on state entry.
                    queuedEvidence: context.queuedEvidence,
                }),
                onDone: {
                    target: 'workup',
                    actions: assign({
                        // We store the intuition result (AIAnalysis format) in visualAnalysis for now,
                        // or we could add a specific 'intuitionResult' to context.
                        // For minimal schema changes, reusing visualAnalysis (which holds diagnosis/confidence) acts as our 'Current Belief'.
                        visualAnalysis: ({ event }) => event.output,
                    }),
                },
                onError: {
                    target: 'settling', // Fail safe: settle honestly instead of synthesizing on no belief
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        workup: {
            description:
                'LM-04: decision-theoretic workup — ranked differential, cost-based next test, stop/escalate. Runs the loop over the recorded results, then either waits for the next result (interactive) or moves on to repair guidance with the plan in context.',
            initial: 'checking',
            // LM-26: the differentiate phase continues here (ranked
            // differential). The planning exit goes through the
            // differentiate gate, not straight to testing.
            entry: assign({ phase: 'differentiate' as const }),
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this state and restarts the workup from the loop state in context.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'workup' as const }) } },
            states: {
                checking: {
                    always: [
                        {
                            target: 'planning',
                            guard: ({ context }) => Boolean(context.diagnosticLoop ?? context.diagnosticLoopInput),
                        },
                        { target: 'preparing' },
                    ],
                },
                preparing: {
                    invoke: {
                        src: 'prepareDiagnosticLoop',
                        input: ({ context }: { context: MechanicContext }) => ({
                            vehicleContext: context.vehicleContext,
                            dtcCodes: context.dtcCodes,
                            userId: context.userId,
                            sessionId: context.sessionId,
                        }),
                        onDone: {
                            target: 'planning',
                            actions: assign({
                                diagnosticLoopInput: ({ event, context }) =>
                                    event.output ?? context.diagnosticLoopInput,
                            }),
                        },
                        onError: {
                            target: 'planning',
                            actions: [assign({ error: ({ event }) => String(event.error) })],
                        },
                    },
                },
                planning: {
                    entry: assign(({ context }) => {
                        const entry = enterWorkup(
                            context.diagnosticLoop ?? null,
                            context.loopTestDefinitions ?? [],
                            context.diagnosticLoopInput,
                        );
                        return { diagnosticLoop: entry.loop, loopTestDefinitions: entry.definitions };
                    }),
                    always: [
                        {
                            target: '#mechanic.differentiate_gate',
                            guard: ({ context }) =>
                                !context.diagnosticLoop ||
                                !context.diagnosticLoopInput?.interactive ||
                                loopIsTerminal(context.diagnosticLoop),
                        },
                        { target: 'awaiting_result' },
                    ],
                },
                awaiting_result: {
                    on: {
                        RECORD_TEST_RESULT: {
                            target: 'planning',
                            actions: assign(({ context, event }) => {
                                if (event.type !== 'RECORD_TEST_RESULT' || !context.diagnosticLoop) {
                                    return {};
                                }
                                const applied = applyWorkupResult(
                                    context.diagnosticLoop,
                                    context.loopTestDefinitions ?? [],
                                    {
                                        testId: event.testId,
                                        outcome: event.outcome,
                                        source: event.source ?? 'tech',
                                    },
                                );
                                // LM-26: the recorded test's labor minutes
                                // count against the goal's test budget.
                                const recorded = (context.loopTestDefinitions ?? []).find(
                                    (definition) => definition.id === event.testId,
                                );
                                const spentMinutes = recorded?.cost.laborMinutes ?? 0;
                                return {
                                    diagnosticLoop: applied.state,
                                    budgetUsage: {
                                        ...context.budgetUsage,
                                        testCostMinutesUsed: context.budgetUsage.testCostMinutesUsed + spentMinutes,
                                    },
                                    ...(applied.error ? { error: applied.error } : {}),
                                };
                            }),
                        },
                        END_WORKUP: '#mechanic.differentiate_gate',
                    },
                },
            },
        },
        // LM-26: the differentiate gate — the ranked differential must
        // satisfy the goal's differentiate criteria before any test runs.
        differentiate_gate: {
            description: 'LM-26: differentiate gate — the goal’s differentiate criteria must be met to test',
            always: [
                {
                    target: 'investigating',
                    guard: ({ context }) =>
                        context.goal === undefined || evaluatePhase(context.goal, context.ledger, 'differentiate').met,
                },
                { target: 'settling' },
            ],
        },
        investigating: {
            description: 'Step 3: Verify Hypothesis (Search & Web)',
            type: 'parallel',
            // LM-26: the test phase starts here.
            entry: assign({ phase: 'test' as const }),
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this parallel state and restarts all regions' invoked actors.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'investigating' as const }) } },
            states: {
                search: {
                    initial: 'searching',
                    states: {
                        searching: {
                            invoke: {
                                src: 'googleSearch',
                                input: ({ context }: { context: MechanicContext }) => {
                                    // INTUITION-DRIVEN SEARCH:
                                    const intuition = context.visualAnalysis;
                                    const query =
                                        intuition?.diagnosis && intuition.diagnosis !== 'Unknown'
                                            ? `${intuition.diagnosis} ${JSON.stringify(context.vehicleContext)}`
                                            : `${context.userQuery} ${JSON.stringify(context.vehicleContext)}`;

                                    return {
                                        service: context.services.search,
                                        data: {
                                            query,
                                            limit: 3,
                                            userId: context.userId,
                                            sessionId: context.sessionId,
                                        },
                                    };
                                },
                                onDone: {
                                    target: 'completed',
                                    actions: assign({ searchResults: ({ event }) => event.output }),
                                },
                                onError: {
                                    target: 'completed',
                                    actions: assign({ error: ({ event }) => String(event.error) }),
                                },
                            },
                        },
                        completed: { type: 'final' },
                    },
                },
                verification: {
                    initial: 'verifying',
                    states: {
                        verifying: {
                            invoke: {
                                src: 'webVerification',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    service: context.services.chat,
                                    data: {
                                        hypothesis: context.visualAnalysis?.diagnosis || context.userQuery,
                                        evidence: JSON.stringify({
                                            vehicle: context.vehicleContext,
                                            recalls: context.nhtsaResults,
                                            history: context.vehicleHistory,
                                            // LM-17 checkpoint: evidence that arrived after the
                                            // intuition call reaches this model call instead of
                                            // starting a competing run over it.
                                            newEvidence: context.queuedEvidence.map(
                                                (item) => `[${item.kind}] ${item.summary}`,
                                            ),
                                        }),
                                        sessionId: context.sessionId,
                                    },
                                }),
                                onDone: {
                                    target: 'completed',
                                    actions: assign({ verificationResult: ({ event }) => event.output }),
                                },
                                onError: {
                                    target: 'completed',
                                    actions: assign({ error: ({ event }) => String(event.error) }),
                                },
                            },
                        },
                        completed: { type: 'final' },
                    },
                },
                // LM-16: the bounded tool loop. Runs only when recorded scan
                // data is present; otherwise it completes immediately and the
                // diagnosis runs as before. A loop failure never fails the
                // diagnosis: search and verification already ran, and the
                // error is recorded in context.
                // LM-26: the reasoner also runs only when the goal is
                // active (LM-17's queue runs the reasoner only when the
                // case is idle and the goal is active; the queue owns the
                // idle side — one active run per case — and this guard owns
                // the active side). A paused, held, or terminal goal skips
                // the loop: no new reasoner work on a goal that is not live.
                reasoner: {
                    initial: 'checking',
                    states: {
                        checking: {
                            always: [
                                {
                                    target: 'running',
                                    guard: ({ context }) =>
                                        (context.goal === undefined || context.goal.status === 'active') &&
                                        Boolean(
                                            context.scanData &&
                                            (context.scanData.freezeFrame !== undefined ||
                                                (context.scanData.pidLog?.length ?? 0) > 0),
                                        ),
                                },
                                { target: 'completed' },
                            ],
                        },
                        running: {
                            invoke: {
                                src: 'runReasoner',
                                input: ({ context }: { context: MechanicContext }) => ({
                                    caseId: context.caseId,
                                    sessionId: context.sessionId,
                                    userId: context.userId,
                                    scanData: context.scanData as ReasonerScanData,
                                }),
                                onDone: {
                                    target: 'completed',
                                    actions: assign({
                                        reasonerResult: ({ event }) => event.output,
                                        // LM-26: a completed reasoner run
                                        // counts against the goal's budget.
                                        budgetUsage: ({ context }) => ({
                                            ...context.budgetUsage,
                                            reasonerRuns: context.budgetUsage.reasonerRuns + 1,
                                        }),
                                    }),
                                },
                                onError: {
                                    target: 'completed',
                                    actions: assign({ error: ({ event }) => String(event.error) }),
                                },
                            },
                        },
                        completed: { type: 'final' },
                    },
                },
            },
            onDone: 'vision_verifying',
        },
        vision_verifying: {
            description: 'Step 4: Vision Check (if applicable) to anchor Reality',
            entry: ['loadVisionModel', assign({ phase: 'test' as const })], // Optimized Resource Management
            exit: 'unloadVisionModel', // Release memory immediately
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this state and restarts the invoked vision call.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'vision_verifying' as const }) } },
            invoke: {
                src: 'visionAnalysis',
                input: ({ context }: { context: MechanicContext }) => ({
                    service: context.services.vision,
                    data: {
                        ...context,
                        searchContext: context.searchResults,
                        verificationContext: context.verificationResult,
                    },
                }),
                onDone: {
                    target: 'gating',
                    actions: assign(({ event, context }) => {
                        // Merge Vision result with Intuition result if vision ran
                        // If no video, we keep the Intuition result (already in visualAnalysis)
                        if (context.videoUrl) {
                            return { visualAnalysis: event.output };
                        }
                        return {};
                    }),
                },
                onError: {
                    target: 'gating',
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        // LM-19: challenger + checklist + independent finish gate before
        // any diagnosis is spoken. It sits where LM-26 puts the test
        // gate's slot — after vision verification, before synthesis — and
        // a pass continues into the test gate, so both gates judge the
        // run in order: the finish gate first (does the diagnosis hold
        // up?), then the test gate (are the goal's test criteria met?).
        // A retry sends the objections back as evidence for another
        // attempt; an abstention settles the run as `abstained` with the
        // handoff, through `settling` like every other ending.
        gating: {
            description:
                'LM-19: challenger + checklist + independent finish gate before any diagnosis is spoken. A pass continues to the test gate; a retry sends the objections back as evidence for another attempt; an abstention settles the run with the handoff.',
            // LM-17: exit to the transient `resuming` state, which re-enters
            // this state and restarts the invoked gate call.
            on: { RESUME: { target: 'resuming', actions: assign({ resumeTarget: 'gating' as const }) } },
            invoke: {
                src: 'runFinishGate',
                input: ({ context }: { context: MechanicContext }): FinishGateInput => ({
                    visual: context.visualAnalysis,
                    recalls: context.nhtsaResults,
                    similar: context.embeddingInfo,
                    verification: context.verificationResult,
                    searchQueryUsed: context.searchResults?.queryUsed ?? null,
                    localTriage: context.localTriage,
                    dtcCodes: context.dtcCodes,
                    ledger: context.ledger,
                    ledgerReadFailed: context.ledgerReadFailed,
                    loopState: context.diagnosticLoop,
                    loopDecision: context.diagnosticLoop?.decision ?? null,
                    testDefinitions: context.loopTestDefinitions,
                    attempt: context.gateAttempts + 1,
                    sessionId: context.sessionId,
                }),
                onDone: [
                    {
                        target: 'test_gate',
                        guard: ({ event }) => event.output.outcome === 'pass' || event.output.outcome === 'skipped',
                        actions: assign({
                            gatedDiagnosis: ({ event }) => event.output.candidate,
                            gateObjections: ({ event }) => event.output.objections,
                            gateReasons: ({ event }) => event.output.reasons,
                        }),
                    },
                    {
                        target: 'settling',
                        guard: ({ event }) => event.output.outcome === 'abstain',
                        actions: assign({
                            // An abstention always carries a handoff; a
                            // gate that reports one without it still ends
                            // the run as `abstained`, with a handoff built
                            // from its own reasons.
                            abstain: ({ event }) =>
                                event.output.handoff ??
                                buildAbstainHandoff({
                                    reason: event.output.reasons.join('; ') || 'The finish gate abstained',
                                    confirmed: [],
                                    ruledOut: [],
                                    nextTest: null,
                                    blockedReasons: event.output.reasons,
                                }),
                            gateObjections: ({ event }) => event.output.objections,
                            gateReasons: ({ event }) => event.output.reasons,
                        }),
                    },
                    {
                        target: 'intuition',
                        guard: ({ event }) => event.output.outcome === 'retry',
                        actions: assign({
                            gateAttempts: ({ context }) => context.gateAttempts + 1,
                            gateObjections: ({ event }) => event.output.objections,
                            gateReasons: ({ event }) => event.output.reasons,
                            queuedEvidence: ({ context, event }) => [
                                ...context.queuedEvidence,
                                ...objectionsAsEvidence(event.output.objections, context.gateAttempts + 1),
                            ],
                        }),
                    },
                ],
                onError: {
                    // A gate that crashes is a failed gate, never a skipped
                    // one: settle as `abstained` with a handoff that says so.
                    target: 'settling',
                    actions: assign({
                        abstain: () =>
                            buildAbstainHandoff({
                                reason: 'The finish gate could not run',
                                confirmed: [],
                                ruledOut: [],
                                nextTest: null,
                                blockedReasons: ['The finish gate could not run'],
                            }),
                        gateReasons: () => ['The finish gate could not run'],
                    }),
                },
            },
        },
        // LM-26: the test gate — the goal's test criteria must be met to
        // commit the diagnosis.
        test_gate: {
            description: 'LM-26: test gate — the goal’s test criteria must be met to commit',
            always: [
                {
                    target: 'synthesizing',
                    guard: ({ context }) =>
                        context.goal === undefined || evaluatePhase(context.goal, context.ledger, 'test').met,
                },
                { target: 'settling' },
            ],
        },
        synthesizing: {
            description:
                'Step 5: Final Synthesis (Reflexion) — LM-26: the commit phase. No longer the end of the run: it commits the diagnosis, then the run advances through the repair and verify gates to one named terminal status.',
            // LM-26: the commit phase. The commit gate judges the goal's
            // commit criteria; a run restored from a snapshot taken when
            // synthesizing was still final re-enters through RESUME, which
            // settles it instead of leaving it parked here.
            entry: assign({ phase: 'commit' as const }),
            on: { RESUME: 'settling' },
            always: [
                {
                    target: 'repair_gate',
                    guard: ({ context }) =>
                        context.goal === undefined || evaluatePhase(context.goal, context.ledger, 'commit').met,
                },
                { target: 'settling' },
            ],
        },
        // LM-26: the repair gate — the goal's repair criteria must be met
        // to verify. Repair itself happens outside the machine (the tech
        // performs it and the ledger records it); the gate reads the ledger.
        repair_gate: {
            description: 'LM-26: repair gate — the goal’s repair criteria must be met to verify',
            entry: assign({ phase: 'repair' as const }),
            always: [
                {
                    target: 'verify_gate',
                    guard: ({ context }) =>
                        context.goal === undefined || evaluatePhase(context.goal, context.ledger, 'repair').met,
                },
                { target: 'settling' },
            ],
        },
        // LM-26: the verify gate — the goal's verify criteria decide the
        // honest ending. The settling state resolves it; this gate exists
        // so the verify phase is entered (and recorded) like every phase.
        verify_gate: {
            description: 'LM-26: verify gate — the goal’s verify criteria decide the terminal status',
            entry: assign({ phase: 'verify' as const }),
            always: [{ target: 'settling' }],
        },
        // LM-26: terminal decision. Resolves exactly one named terminal
        // status from the goal, ledger, budget, safety, abstain, workup
        // and reasoner signals, then routes to that final state. The
        // resolver is total, so the last, guardless transition is only a
        // defensive fallback.
        settling: {
            description: 'LM-26: terminal decision — resolves the run’s one named terminal status',
            entry: assign(({ context }) => {
                const resolution = resolveTerminalStatus({
                    goal: context.goal,
                    ledger: context.ledger,
                    budgetUsage: context.budgetUsage,
                    safetyStop: context.safetyStop,
                    abstain: context.abstain,
                    loopDecision: context.diagnosticLoop?.decision ?? null,
                    reasonerResult: context.reasonerResult,
                });
                return { terminalStatus: resolution.status, terminalReason: resolution.reason };
            }),
            always: [
                { target: 'verified_fix', guard: ({ context }) => context.terminalStatus === 'verified_fix' },
                {
                    target: 'diagnosed_unverified',
                    guard: ({ context }) => context.terminalStatus === 'diagnosed_unverified',
                },
                { target: 'abstained', guard: ({ context }) => context.terminalStatus === 'abstained' },
                { target: 'safety_stopped', guard: ({ context }) => context.terminalStatus === 'safety_stopped' },
                { target: 'escalated', guard: ({ context }) => context.terminalStatus === 'escalated' },
                { target: 'budget_limited', guard: ({ context }) => context.terminalStatus === 'budget_limited' },
                { target: 'diagnosed_unverified' },
            ],
        },
        verified_fix: {
            description: 'LM-26: every goal criterion is met, including the pre-registered re-test',
            type: 'final',
        },
        diagnosed_unverified: {
            description: 'LM-26: a diagnosis was reached but the fix is not proven verified',
            type: 'final',
        },
        abstained: {
            description: 'LM-26: the run abstained, with the handoff in context',
            type: 'final',
        },
        safety_stopped: {
            description: 'LM-26: the run stopped for safety',
            type: 'final',
        },
        escalated: {
            description: 'LM-26: the run could not proceed and hands the case to the tech',
            type: 'final',
        },
        budget_limited: {
            description: 'LM-26: the goal budget is spent; the run stops here',
            type: 'final',
        },
        resuming: {
            description:
                'LM-17: transient re-entry after a snapshot restore. A RESUME exits the invoking state here with resumeTarget recorded; this state immediately re-enters that state, which restarts its invoked actor. The last, guardless transition is the fallback: a restore that lands here with no target restarts from context gathering, which only re-reads facts.',
            always: [
                { target: 'gathering_context', guard: ({ context }) => context.resumeTarget === 'gathering_context' },
                { target: 'intuition', guard: ({ context }) => context.resumeTarget === 'intuition' },
                { target: 'workup', guard: ({ context }) => context.resumeTarget === 'workup' },
                { target: 'investigating', guard: ({ context }) => context.resumeTarget === 'investigating' },
                { target: 'vision_verifying', guard: ({ context }) => context.resumeTarget === 'vision_verifying' },
                { target: 'gating', guard: ({ context }) => context.resumeTarget === 'gating' },
                { target: 'gathering_context' },
            ],
        },
    },
});
