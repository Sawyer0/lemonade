import { injectable, inject } from 'inversify';
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
} from '@lemonade/core';
import { mechanicMachine } from '@lemonade/core';
import { createActor, waitFor } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';
import { DiagnosisSafetyGate } from './diagnosis/DiagnosisSafetyGate';
import { IntuitionGenerator } from './diagnosis/IntuitionGenerator';
import { EvidenceAnalyzer } from './diagnosis/EvidenceAnalyzer';
import { DiagnosisMemoryWriter } from './diagnosis/DiagnosisMemoryWriter';
import { synthesizeDiagnosis } from './diagnosis/DiagnosisSynthesizer';
import { createMechanicActors } from './diagnosis/mechanicActors';

const DIAGNOSIS_TIMEOUT_MS = 120_000;
const MEMORY_SAVE_CONFIDENCE = 0.8;

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
            exec: () => this.runDiagnosis(input),
        });
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

    /** Runs the mechanic machine to its synthesizing state, persisting each snapshot. */
    private async runMachine(input: ReasoningInput) {
        const inspectorEnabled = process.env.XSTATE_INSPECTOR === 'true';

        const actor = createActor(
            mechanicMachine.provide({
                actors: this.actors,
                actions: {
                    loadVisionModel: () => this.logger.debug('Initializing Vision Analysis resources'),
                    unloadVisionModel: () => this.logger.debug('Releasing Vision Analysis resources'),
                },
            }),
            {
                input: {
                    userQuery: input.userQuery,
                    videoUrl: input.videoUrl,
                    vehicleContext: input.vehicleContext,
                    sessionId: input.sessionId,
                    userId: input.userId,
                    localTriage: input.localTriage,
                    dtcCodes: input.dtcCodes,
                    services: {
                        vision: this.videoAI,
                        chat: this.chatAI,
                        nhtsa: this.nhtsaService,
                        vector: this.vectorRepo,
                        search: this.searchService,
                        memory: this.memoryService,
                    },
                },
                inspect: inspectorEnabled ? createBrowserInspector().inspect : undefined,
            },
        );

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

        const finalState = await waitFor(actor, (state) => state.matches('synthesizing'), {
            timeout: DIAGNOSIS_TIMEOUT_MS,
        });

        await this.sessionRepo
            .clearXStateSnapshot(input.sessionId)
            .catch((err) =>
                this.logger.warn('Failed to clear XState snapshot', { error: err, sessionId: input.sessionId }),
            );

        return finalState.context;
    }
}
