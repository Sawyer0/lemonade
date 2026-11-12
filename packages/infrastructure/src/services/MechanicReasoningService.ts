import { injectable, inject, optional } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import type {
    IMechanicReasoningService,
    ReasoningInput,
    CaseEvidence,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IGoogleSearchService,
    IMemoryService,
    IReactiveSafetyService,
    ISessionRepository,
    ISafetyMonitor,
    ITracingService,
    IMultimodalUploadAnalyzer,
    IChatAssistantAI,
    AIAnalysis,
    ILogger,
    NeurosymbolicState,
    SafetyRecall,
    ICaseRepository,
    IFixCountStore,
} from '@lemonade/core';
import { AppError, ErrorCode, isMechanicTerminalState, mechanicMachine } from '@lemonade/core';
import { GEMINI_PRO_MODEL } from '@lemonade/core';
import type { ReasonerActorRunner, ReasonerModel, ReasonerRegionResult, ReasonerRunRequest } from '@lemonade/core';
import { createActor, waitFor } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';
import { LocalSandbox } from '../sandbox/LocalSandbox';
import { ReasonerRunner } from '../reasoning/ReasonerRunner';
import { GeminiReasonerModel, createVertexReasonerModel } from '../reasoning/GeminiReasonerModel';
import { DiagnosisSafetyGate } from './diagnosis/DiagnosisSafetyGate';
import { IntuitionGenerator } from './diagnosis/IntuitionGenerator';
import { EvidenceAnalyzer } from './diagnosis/EvidenceAnalyzer';
import { DiagnosisMemoryWriter } from './diagnosis/DiagnosisMemoryWriter';
import { synthesizeDiagnosis, verificationDataFrom } from './diagnosis/DiagnosisSynthesizer';
import { DiagnosticLoopPreparer } from './diagnosis/DiagnosticLoopPreparer';
import { createMechanicActors } from './diagnosis/mechanicActors';
import { CaseRunCoordinator } from './CaseRunCoordinator';

const DIAGNOSIS_TIMEOUT_MS = 120_000;
const MEMORY_SAVE_CONFIDENCE = 0.8;
// How often a running case run polls its queue for evidence that arrived
// mid-run, so it can be forwarded to the actor at the next checkpoint
// (LM-17). Short enough that evidence reaches the next model call, long
// enough to stay cheap while the machine is doing the real work.
const EVIDENCE_FORWARD_MS = 250;

const NO_VISUAL_ANALYSIS: AIAnalysis = {
    diagnosis: 'Unknown',
    confidence: 0,
    visual_evidence: [],
    acoustic_evidence: [],
    severity: 'low',
    safety_alert: false,
    suggested_actions: [],
    engineDescription: 'No visual analysis performed',
    isStock: true,
    visualConflictDetected: false,
    detectedCondition: 'unknown',
    reasoning: 'No analysis performed',
    investigationPlan: [],
};

/**
 * System 2 diagnosis. Gates on safety, then drives the mechanic state machine
 * through context gathering, intuition, research and evidence, and synthesizes
 * a final decision. Each step lives in its own module under ./diagnosis.
 */
@injectable()
export class MechanicReasoningService implements IMechanicReasoningService {
    private readonly safetyGate: DiagnosisSafetyGate;
    private readonly memoryWriter: DiagnosisMemoryWriter;
    private readonly actors: ReturnType<typeof createMechanicActors>;
    // LM-16: lazily built on the first reasoner run, so diagnoses without
    // scan data never pay the sandbox probe. null means the attempt already
    // failed (no namespaces, no diaglib) and will not be retried.
    private reasonerRunnerCache: ReasonerRunner | null | undefined;
    private reasonerModelCache: ReasonerModel | undefined;

    constructor(
        @inject(TYPES.MultimodalUploadAI) private videoAI: IMultimodalUploadAnalyzer,
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.NHTSAService) private nhtsaService: INHTSAService,
        @inject(TYPES.EmbeddingService) embeddingService: IEmbeddingService,
        @inject(TYPES.VectorRepository) private vectorRepo: IVectorRepository,
        @inject(TYPES.GoogleSearchService) private searchService: IGoogleSearchService,
        @inject(TYPES.SupermemoryService) private memoryService: IMemoryService,
        @inject(TYPES.SessionRepository) private sessionRepo: ISessionRepository,
        @inject(TYPES.ReactiveSafetyService) reactiveSafety: IReactiveSafetyService,
        @inject(TYPES.SafetyMonitor) safetyMonitor: ISafetyMonitor,
        @inject(TYPES.TracingService) private tracer: ITracingService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
        // LM-17: optional so direct construction in tests keeps working.
        // The DI container binds both; a service built without them still
        // coordinates runs per case, it just cannot guard the version commit.
        @inject(TYPES.CaseRunCoordinator)
        @optional()
        private runCoordinator: CaseRunCoordinator = new CaseRunCoordinator(),
        @inject(TYPES.CaseRepo) @optional() private caseRepo?: ICaseRepository,
        // LM-04: optional for the same reason. Without a fix-count store
        // (no case-ledger database) the workup's prepare actor returns
        // null and the diagnosis runs as before.
        @inject(TYPES.FixCountStore) @optional() private fixCountStore?: IFixCountStore,
    ) {
        this.safetyGate = new DiagnosisSafetyGate(reactiveSafety, safetyMonitor, logger);
        this.memoryWriter = new DiagnosisMemoryWriter(embeddingService, vectorRepo, memoryService, sessionRepo, logger);
        this.actors = createMechanicActors({
            intuition: new IntuitionGenerator(coreAdapter, logger),
            evidence: new EvidenceAnalyzer(videoAI, chatAI, logger),
            nhtsaService,
            searchService,
            chatAI,
            logger,
            reasoner: this.reasonerActor(),
            loopPreparer: new DiagnosticLoopPreparer({ fixCountStore: this.fixCountStore }, logger),
        });
    }

    /**
     * LM-16: the `investigating` reasoner region's runner. Bound as an
     * object so the machine actor never sees the lazy construction: when no
     * sandbox is available the region reports `skipped` and the diagnosis
     * runs as before.
     */
    private reasonerActor(): ReasonerActorRunner {
        return {
            run: async (request: ReasonerRunRequest): Promise<ReasonerRegionResult> => {
                const runner = this.getReasonerRunner();
                if (!runner) {
                    return {
                        endState: 'skipped',
                        endReason: 'no reasoner sandbox available',
                        steps: [],
                        citations: [],
                    };
                }
                return runner.run({ ...request, model: this.getReasonerModel() });
            },
        };
    }

    private getReasonerRunner(): ReasonerRunner | undefined {
        if (this.reasonerRunnerCache === undefined) {
            this.reasonerRunnerCache = this.buildReasonerRunner();
        }
        return this.reasonerRunnerCache ?? undefined;
    }

    private buildReasonerRunner(): ReasonerRunner | null {
        try {
            const sandbox = new LocalSandbox();
            if (!sandbox.available) {
                this.logger.info(
                    '[MechanicReasoning] No reasoner sandbox available here; the reasoner region will skip',
                );
                return null;
            }
            return new ReasonerRunner({ sandbox, logger: this.logger, caseRepo: this.caseRepo });
        } catch (error) {
            this.logger.warn('[MechanicReasoning] Could not build the reasoner runner; the reasoner region will skip', {
                error,
            });
            return null;
        }
    }

    private getReasonerModel(): ReasonerModel {
        if (!this.reasonerModelCache) {
            this.reasonerModelCache = new GeminiReasonerModel((tools) =>
                createVertexReasonerModel(this.coreAdapter.getGenerativeModel(GEMINI_PRO_MODEL, tools)),
            );
        }
        return this.reasonerModelCache;
    }

    async diagnose(input: ReasoningInput): Promise<NeurosymbolicState> {
        return this.tracer.traceAiCall({
            name: 'mechanic_system_2_diagnosis',
            runType: 'chain',
            inputs: {
                userQuery: input.userQuery,
                vehicleContext: input.vehicleContext,
                complaint: input.complaint,
            },
            tags: ['neurosymbolic', 'diagnosis'],
            exec: () => this.runCaseOrDirectDiagnosis(input),
        });
    }

    /**
     * LM-17: a diagnosis that belongs to a case runs as that case's single
     * active run. A second caller for the same case never starts a competing
     * run: its question joins the active run's evidence queue, and it
     * observes the active run's result. A diagnosis without a case runs
     * exactly as before.
     */
    private async runCaseOrDirectDiagnosis(input: ReasoningInput): Promise<NeurosymbolicState> {
        if (!input.caseId) {
            return this.runDiagnosis(input);
        }
        const caseId = input.caseId;
        if (this.runCoordinator.activeRunId(caseId)) {
            this.runCoordinator.submitEvidence(caseId, this.runCoordinator.evidenceFromQuery(input.userQuery));
        }
        return this.runCoordinator.execute(caseId, uuidv4(), () => this.runCaseDiagnosis(input));
    }

    /** A case run: read the case version, run, then commit with that version. */
    private async runCaseDiagnosis(input: ReasoningInput): Promise<NeurosymbolicState> {
        const caseId = input.caseId as string;
        const readVersion = await this.readCaseVersion(caseId);
        const state = await this.runDiagnosis(input);
        await this.commitCaseRun(caseId, readVersion);
        return state;
    }

    private async readCaseVersion(caseId: string): Promise<number | null> {
        if (!this.caseRepo) {
            this.logger.debug(
                '[MechanicReasoning] No case repository bound; case runs commit without a version guard',
                {
                    caseId,
                },
            );
            return null;
        }
        const caseRecord = await this.caseRepo.findCaseById(caseId);
        if (!caseRecord) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
        }
        return caseRecord.version;
    }

    /**
     * Commits the run against the version it read. A VERSION_CONFLICT means
     * the case moved on mid-run (another run committed, or a ledger append
     * landed): the diagnosis is still returned, but the stale run is not
     * recorded as the case's latest. Any other failure propagates.
     */
    private async commitCaseRun(caseId: string, readVersion: number | null): Promise<void> {
        if (!this.caseRepo || readVersion === null) {
            return;
        }
        try {
            const newVersion = await this.caseRepo.advanceCaseVersion(caseId, readVersion);
            this.logger.info('[MechanicReasoning] Case run committed', { caseId, version: newVersion });
        } catch (error) {
            if (error instanceof AppError && error.code === ErrorCode.VERSION_CONFLICT) {
                this.logger.warn(
                    '[MechanicReasoning] Stale case run commit refused; diagnosis kept, case not updated',
                    {
                        caseId,
                        readVersion,
                    },
                );
                return;
            }
            throw error;
        }
    }

    private async runDiagnosis(input: ReasoningInput): Promise<NeurosymbolicState> {
        this.logger.info('[MechanicReasoning] Starting System 2 Diagnosis Loop (XState)', {
            sessionId: input.sessionId,
        });

        const safetyStop = await this.safetyGate.check(input);
        if (safetyStop) return safetyStop;

        const ctx = await this.runMachine(input);

        const visual = ctx.visualAnalysis || NO_VISUAL_ANALYSIS;
        const nhtsa = (ctx.nhtsaResults || []) as SafetyRecall[];
        const similar = ctx.embeddingInfo || [];
        const verificationResult = ctx.verificationResult || {
            isVerified: false,
            source: null,
            reasoning: 'No verification run',
        };

        const verification = verificationDataFrom(verificationResult, ctx.searchResults?.queryUsed || null);

        const state: NeurosymbolicState = {
            complaint: input.complaint,
            intuition: {
                hypothesis: visual.diagnosis,
                confidence: visual.confidence,
                reasoning: 'XState Logic',
                investigationPlan: [],
            },
            authorityData: {
                vin: input.vehicleContext.vin as string,
                nhtsaRecalls: nhtsa.map((r) => r.Summary || 'Unknown'),
                manualSpecs: null,
                safetyAlerts: [],
            },
            visualGrounding: {
                engineDescription: 'Analyzed',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
            },
            consensus: {
                similarCasesFound: similar.length,
                consensusFix: similar.length > 0 ? (similar[0] as { text: string }).text : null,
                isKnownIssue: similar.length > 1,
            },
            verification,
            finalDiagnosis: synthesizeDiagnosis(visual, nhtsa, similar, verification, ctx.localTriage),
        };

        if (state.intuition.confidence > MEMORY_SAVE_CONFIDENCE && state.finalDiagnosis.decision === 'PROCEED') {
            this.memoryWriter
                .save(state.complaint || input.userQuery, state, input.userId, input.sessionId)
                .catch((err) => this.logger.error('Failed to save individual case to collective memory', err));
        }

        return state;
    }

    /**
     * Runs the mechanic machine to one of its terminal states (LM-26:
     * verified_fix, diagnosed_unverified, abstained, safety_stopped,
     * escalated or budget_limited), persisting each snapshot. LM-17: a
     * stored snapshot from a crashed run is restored, so the case resumes
     * where it left off instead of starting over; evidence that arrives
     * mid-run is forwarded to the actor, which folds it in at the next
     * checkpoint (before a model call, between sequential tools).
     * Evidence that arrives after the run's last checkpoint — when no model
     * call is left to read it — is re-queued for the next run instead of
     * being dropped (see the finally block below).
     */
    private async runMachine(input: ReasoningInput) {
        const inspectorEnabled = process.env.XSTATE_INSPECTOR === 'true';
        const services = {
            vision: this.videoAI,
            chat: this.chatAI,
            nhtsa: this.nhtsaService,
            vector: this.vectorRepo,
            search: this.searchService,
            memory: this.memoryService,
        };

        // The stored snapshot comes first: when one exists, its context
        // already carries the queued evidence, so a pre-run drain would
        // have nowhere to go (createActor ignores input on restore).
        const storedSnapshot = await this.readStoredSnapshot(input.sessionId);
        const queuedEvidence =
            storedSnapshot || !input.caseId ? [] : this.runCoordinator.drainAtCheckpoint(input.caseId);

        const providedMachine = mechanicMachine.provide({
            actors: this.actors,
            actions: {
                loadVisionModel: () => this.logger.debug('Initializing Vision Analysis resources'),
                unloadVisionModel: () => this.logger.debug('Releasing Vision Analysis resources'),
            },
        });
        const actorInput = {
            userQuery: input.userQuery,
            videoUrl: input.videoUrl,
            vehicleContext: input.vehicleContext,
            sessionId: input.sessionId,
            userId: input.userId,
            localTriage: input.localTriage,
            dtcCodes: input.dtcCodes,
            services,
            queuedEvidence,
            caseId: input.caseId,
            scanData: input.scanData,
            diagnosticLoopInput: input.diagnosticLoopInput,
        };
        let actor = createActor(providedMachine, {
            input: actorInput,
            snapshot: storedSnapshot ?? undefined,
            inspect: inspectorEnabled ? createBrowserInspector().inspect : undefined,
        });
        let restored = storedSnapshot !== null;
        if (restored && actor.getSnapshot().status === 'error') {
            // XState swallows a failed restore into an error-status snapshot
            // instead of throwing: a snapshot from a machine that changed
            // since the crash falls back to a fresh run rather than failing
            // the diagnosis.
            this.logger.warn('[MechanicReasoning] Stored XState snapshot could not be restored; starting fresh', {
                error: actor.getSnapshot().error,
                sessionId: input.sessionId,
            });
            actor = createActor(providedMachine, {
                input: actorInput,
                inspect: inspectorEnabled ? createBrowserInspector().inspect : undefined,
            });
            restored = false;
        }

        if (inspectorEnabled) {
            this.logger.info('[XState Inspector] Enabled - Connecting to Stately Studio', {
                sessionId: input.sessionId,
            });
        }

        // LM-17: evidence forwarded to the actor after the run's last model
        // call started can be read by nothing — that call's input was already
        // built, and synthesizing makes no model call. Track which forwarded
        // items the last checkpoint consumed, so the rest can be re-queued
        // for the next run instead of silently dropped.
        const forwarded: CaseEvidence[] = [];
        let consumedThrough = 0;
        let recordedCheckpoint: 'intuition' | 'investigating' | 'vision_verifying' | null = null;
        // The last checkpoint whose model call actually runs: with no video
        // the vision actor returns without a model call, so investigating is
        // the last one that can see evidence.
        const checkpointOrder = ['intuition', 'investigating', 'vision_verifying'] as const;
        const lastCheckpoint: (typeof checkpointOrder)[number] = input.videoUrl ? 'vision_verifying' : 'investigating';

        actor.subscribe((state) => {
            // Record the first entry into each checkpoint state: everything
            // forwarded up to that moment is in the model call's input. A
            // later transition inside the same state (a parallel region
            // finishing) must not move the mark — evidence forwarded after
            // the call started is still unread.
            const checkpoint: typeof recordedCheckpoint = state.matches('vision_verifying')
                ? 'vision_verifying'
                : state.matches('investigating')
                  ? 'investigating'
                  : state.matches('intuition')
                    ? 'intuition'
                    : null;
            if (
                checkpoint !== null &&
                checkpoint !== recordedCheckpoint &&
                checkpointOrder.indexOf(checkpoint) <= checkpointOrder.indexOf(lastCheckpoint)
            ) {
                recordedCheckpoint = checkpoint;
                consumedThrough = forwarded.length;
            }
            this.logger.debug(`[MechanicMachine] State: ${JSON.stringify(state.value)}`, {
                error: state.context.error,
            });
            this.sessionRepo
                .saveXStateSnapshot(input.sessionId, state)
                .catch((err) =>
                    this.logger.warn('Failed to save XState snapshot', { error: err, sessionId: input.sessionId }),
                );
        });

        actor.start();

        const restoredState = actor.getSnapshot();
        if (restored) {
            // The restored context's services are serialized husks (their
            // functions did not survive JSON); put the live ones back
            // before anything invokes them.
            actor.send({ type: 'UPDATE_SERVICES', services });
            if (!restoredState.matches('idle') && !isMechanicTerminalState(restoredState.value)) {
                // Re-enter the restored state so its dead invoked actor
                // starts again; without this the run would sit there forever.
                actor.send({ type: 'RESUME' });
            }
        }

        // Evidence that arrives mid-run joins the actor at its next
        // checkpoint. The timer stops when the run settles, even on timeout.
        // Evidence forwarded after the last checkpoint is re-queued in the
        // finally block below, so it reaches the next run instead of vanishing.
        const forwardTimer = input.caseId
            ? setInterval(() => {
                  for (const item of this.runCoordinator.drainAtCheckpoint(input.caseId as string)) {
                      forwarded.push(item);
                      actor.send({ type: 'APPEND_EVIDENCE', evidence: item });
                  }
              }, EVIDENCE_FORWARD_MS)
            : undefined;

        try {
            if (restoredState.matches('idle')) {
                // Brief delay to ensure the actor is ready before the first event.
                await new Promise((resolve) => setTimeout(resolve, 50));

                actor.send({
                    type: 'DIAGNOSE',
                    userQuery: input.userQuery,
                    videoUrl: input.videoUrl,
                    vehicleContext: input.vehicleContext,
                    sessionId: input.sessionId,
                    userId: input.userId,
                    localTriage: input.localTriage,
                    dtcCodes: input.dtcCodes,
                    caseId: input.caseId,
                    scanData: input.scanData,
                    diagnosticLoopInput: input.diagnosticLoopInput,
                });
            }

            const finalState = await waitFor(actor, (state) => isMechanicTerminalState(state.value), {
                timeout: DIAGNOSIS_TIMEOUT_MS,
            });

            // Stop forwarding now: the actor is done, so anything drained
            // after this point would be sent to a finished actor and lost.
            if (forwardTimer) {
                clearInterval(forwardTimer);
            }

            await this.sessionRepo
                .clearXStateSnapshot(input.sessionId)
                .catch((err) =>
                    this.logger.warn('Failed to clear XState snapshot', { error: err, sessionId: input.sessionId }),
                );

            return finalState.context;
        } finally {
            if (forwardTimer) {
                clearInterval(forwardTimer);
            }
            // Evidence that arrived after the last checkpoint was forwarded
            // to the actor but read by no model call — and it was already
            // drained from the coordinator queue, so the next run would not
            // see it either. Re-queue it so the next run for this case does.
            if (input.caseId) {
                const leftovers = forwarded.slice(consumedThrough);
                if (leftovers.length > 0) {
                    for (const item of leftovers) {
                        this.runCoordinator.submitEvidence(input.caseId, item);
                    }
                    this.logger.info(
                        '[MechanicReasoning] Re-queued evidence that arrived after the last checkpoint; the next run for this case will see it',
                        {
                            caseId: input.caseId,
                            count: leftovers.length,
                            evidenceIds: leftovers.map((item) => item.id),
                        },
                    );
                }
            }
        }
    }

    /**
     * Reads the persisted XState snapshot for the session, or null when
     * there is none, it is malformed, or it cannot be read. A bad snapshot
     * never fails the diagnosis: the run starts fresh and overwrites it.
     */
    private async readStoredSnapshot(sessionId: string): Promise<SnapshotFrom<typeof mechanicMachine> | null> {
        if (typeof this.sessionRepo.getXStateSnapshot !== 'function') {
            return null;
        }
        try {
            const stored: unknown = await this.sessionRepo.getXStateSnapshot(sessionId);
            if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
                return null;
            }
            if (!('value' in stored) || !('context' in stored) || !('status' in stored)) {
                this.logger.warn('[MechanicReasoning] Stored XState snapshot has an unexpected shape; starting fresh', {
                    sessionId,
                });
                return null;
            }
            return stored as SnapshotFrom<typeof mechanicMachine>;
        } catch (error) {
            this.logger.warn('[MechanicReasoning] Failed to read XState snapshot; starting fresh', {
                error,
                sessionId,
            });
            return null;
        }
    }
}
