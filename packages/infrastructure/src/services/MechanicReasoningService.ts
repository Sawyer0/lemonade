import { injectable, inject, optional } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import type {
    IMechanicReasoningService,
    ReasoningInput,
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
    VerificationData,
    SafetyRecall,
    ICaseRepository,
} from '@lemonade/core';
import { AppError, ErrorCode, mechanicMachine } from '@lemonade/core';
import { createActor, waitFor } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';
import { DiagnosisSafetyGate } from './diagnosis/DiagnosisSafetyGate';
import { IntuitionGenerator } from './diagnosis/IntuitionGenerator';
import { EvidenceAnalyzer } from './diagnosis/EvidenceAnalyzer';
import { DiagnosisMemoryWriter } from './diagnosis/DiagnosisMemoryWriter';
import { synthesizeDiagnosis } from './diagnosis/DiagnosisSynthesizer';
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

/** Words in a failed verification's reasoning that mark it as contradicting the hypothesis. */
const CONFLICT_MARKERS = ['electric', 'not', 'contradict', 'wrong'];

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
        @inject(TYPES.GeminiCoreAdapter) coreAdapter: GeminiCoreAdapter,
        // LM-17: optional so direct construction in tests keeps working.
        // The DI container binds both; a service built without them still
        // coordinates runs per case, it just cannot guard the version commit.
        @inject(TYPES.CaseRunCoordinator)
        @optional()
        private runCoordinator: CaseRunCoordinator = new CaseRunCoordinator(),
        @inject(TYPES.CaseRepo) @optional() private caseRepo?: ICaseRepository,
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
        });
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
            this.logger.debug('[MechanicReasoning] No case repository bound; case runs commit without a version guard', {
                caseId,
            });
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
                this.logger.warn('[MechanicReasoning] Stale case run commit refused; diagnosis kept, case not updated', {
                    caseId,
                    readVersion,
                });
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

        const reasoningLower = (verificationResult.reasoning || '').toLowerCase();
        const isExplicitConflict =
            !verificationResult.isVerified && CONFLICT_MARKERS.some((marker) => reasoningLower.includes(marker));

        const verification: VerificationData = {
            isVerified: verificationResult.isVerified,
            verifiedSource: verificationResult.source || null,
            searchQueryUsed: ctx.searchResults?.queryUsed || null,
            conflictingEvidence: isExplicitConflict ? verificationResult.reasoning : null,
        };

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
     * Runs the mechanic machine to its synthesizing state, persisting each
     * snapshot. LM-17: a stored snapshot from a crashed run is restored, so
     * the case resumes where it left off instead of starting over; evidence
     * that arrives mid-run is forwarded to the actor, which folds it in at
     * the next checkpoint (before a model call, between sequential tools).
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

        actor.subscribe((state) => {
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
            if (!restoredState.matches('idle') && !restoredState.matches('synthesizing')) {
                // Re-enter the restored state so its dead invoked actor
                // starts again; without this the run would sit there forever.
                actor.send({ type: 'RESUME' });
            }
        }

        // Evidence that arrives mid-run joins the actor at its next
        // checkpoint. The timer stops when the run settles, even on timeout.
        const forwardTimer = input.caseId
            ? setInterval(() => {
                  for (const item of this.runCoordinator.drainAtCheckpoint(input.caseId as string)) {
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
                });
            }

            const finalState = await waitFor(actor, (state) => state.matches('synthesizing'), {
                timeout: DIAGNOSIS_TIMEOUT_MS,
            });

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
