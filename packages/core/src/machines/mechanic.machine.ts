import { setup, fromPromise, assign } from 'xstate';
import { NeurosymbolicState } from '../types/neurosymbolic';
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
import type { DiagnosticLoopInput, DiagnosticLoopState, TestResultInput } from '../diagnosis/loop/types';
import { enterWorkup, applyWorkupResult, loopIsTerminal } from '../diagnosis/loop/loop';

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
}

/** Invoking states a crash resume can re-enter (LM-17). */
export type ResumeTarget = 'gathering_context' | 'intuition' | 'workup' | 'investigating' | 'vision_verifying';

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
      }
    | { type: 'UPDATE_SERVICES'; services: MechanicServices }
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
    | { type: 'RECORD_TEST_RESULT'; testId: string; outcome: TestResultInput['outcome']; source?: TestResultInput['source'] }
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
        nhtsaResults: [],
        embeddingInfo: [],
        vehicleHistory: [],
    }),
    // Root-level events, handled in every state. UPDATE_SERVICES lives here
    // (not only in idle) so a snapshot-restored actor can receive live
    // services in whatever state it resumes in; APPEND_EVIDENCE is the
    // checkpoint steering event (LM-17).
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
    },
    states: {
        idle: {
            on: {
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
                    target: 'intuition',
                    actions: [
                        assign({
                            nhtsaResults: ({ event }) => event.output.recalls,
                            vehicleHistory: ({ event }) => event.output.history,
                            embeddingInfo: ({ event }) => event.output.vectors,
                        }),
                    ],
                },
                onError: {
                    target: 'intuition', // Continue even on error
                    actions: [assign({ error: ({ event }) => String(event.error) })],
                },
            },
        },
        intuition: {
            description: 'Step 2: Formulate Hypothesis (ASE Master Tech) using gathered context',
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
                    target: 'synthesizing', // Fail safe
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        workup: {
            description:
                'LM-04: decision-theoretic workup — ranked differential, cost-based next test, stop/escalate. Runs the loop over the recorded results, then either waits for the next result (interactive) or moves on to repair guidance with the plan in context.',
            initial: 'checking',
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
                            target: '#mechanic.investigating',
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
                                return {
                                    diagnosticLoop: applied.state,
                                    ...(applied.error ? { error: applied.error } : {}),
                                };
                            }),
                        },
                        END_WORKUP: '#mechanic.investigating',
                    },
                },
            },
        },
        investigating: {
            description: 'Step 3: Verify Hypothesis (Search & Web)',
            type: 'parallel',
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
                reasoner: {
                    initial: 'checking',
                    states: {
                        checking: {
                            always: [
                                {
                                    target: 'running',
                                    guard: ({ context }) =>
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
                                    actions: assign({ reasonerResult: ({ event }) => event.output }),
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
            entry: 'loadVisionModel', // Optimized Resource Management
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
                    target: 'synthesizing',
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
                    target: 'synthesizing',
                    actions: assign({ error: ({ event }) => String(event.error) }),
                },
            },
        },
        synthesizing: {
            description: 'Step 5: Final Synthesis (Reflexion)',
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
                { target: 'gathering_context' },
            ],
        },
    },
});
