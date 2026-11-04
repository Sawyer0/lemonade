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
    NhtsaInput,
    VectorInput,
    SearchInput,
    VerificationInput,
    MemoryInput,
    SearchResponse,
    VerificationResponse,
    MemorySearchResult,
    SafetyRecall,
    IntuitionInput,
    GatherAllContextInput,
    VisionInput,
    DeepPartial,
} from '@lemonade/core';
import { MechanicPrompts, MemoryTags, getModelForState } from '@lemonade/core';
import { mechanicMachine } from '@lemonade/core';
import { createActor, waitFor, fromPromise } from 'xstate';
import { createBrowserInspector } from '@statelyai/inspect';
import { TYPES } from '../di/types';
import { GeminiCoreAdapter } from '../ai/GeminiCoreAdapter';

interface LocalTriageDetection {
    id?: { obj: string };
    confidence?: number;
}

@injectable()
export class MechanicReasoningService implements IMechanicReasoningService {
    constructor(
        @inject(TYPES.MultimodalUploadAI) private videoAI: IMultimodalUploadAnalyzer,
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.NHTSAService) private nhtsaService: INHTSAService,
        @inject(TYPES.EmbeddingService) private embeddingService: IEmbeddingService,
        @inject(TYPES.VectorRepository) private vectorRepo: IVectorRepository,
        @inject(TYPES.GoogleSearchService) private searchService: IGoogleSearchService,
        @inject(TYPES.SupermemoryService) private memoryService: IMemoryService,
        @inject(TYPES.SessionRepository) private sessionRepo: ISessionRepository,
        @inject(TYPES.ReactiveSafetyService) private reactiveSafety: IReactiveSafetyService,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
        @inject(TYPES.TracingService) private tracer: ITracingService,
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.GeminiCoreAdapter) private coreAdapter: GeminiCoreAdapter,
    ) {}

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

        // Phase 1: Reactive Layer (Immediate Safety Gating)
        const reactiveAssessment = this.reactiveSafety.checkSafety(input.userQuery);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Reactive Safety Triggered', {
                sessionId: input.sessionId,
                hazard: reactiveAssessment.hazards_detected,
            });
            return {
                complaint: input.complaint,
                intuition: {
                    hypothesis: 'Immediate Hazard',
                    confidence: 1.0,
                    reasoning: 'Reactive Layer Triggered',
                    investigationPlan: [],
                },
                authorityData: {
                    vin: input.vehicleContext.vin as string,
                    nhtsaRecalls: [],
                    manualSpecs: null,
                    safetyAlerts: reactiveAssessment.hazards_detected,
                },
                visualGrounding: {
                    engineDescription: 'Gated',
                    isStock: true,
                    visualConflictDetected: false,
                    detectedCondition: 'unknown',
                },
                consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
                verification: {
                    isVerified: false,
                    verifiedSource: null,
                    searchQueryUsed: null,
                    conflictingEvidence: null,
                },
                finalDiagnosis: {
                    decision: 'STOP_DANGER',
                    reasoningTrace: `REACTIVE_LAYER: Match found for ${reactiveAssessment.hazards_detected[0]}`,
                    userOutput:
                        reactiveAssessment.suggested_output ||
                        'CRITICAL SAFETY STOP: Immediate hazard detected. Do not proceed.',
                    requiredActions: ['Evacuate area', 'Follow safety instructions'],
                    metaConfidence: 1.0,
                },
            };
        }

        // Phase 2: Semantic Layer (SafetyMonitor System 1)
        const vehicleContextStr = JSON.stringify(input.vehicleContext);
        const semanticAssessment = await this.safetyMonitor.assess(input.userQuery, vehicleContextStr);
        if (semanticAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Semantic Safety Triggered', {
                sessionId: input.sessionId,
                hazard: semanticAssessment.hazards_detected,
            });
            return {
                complaint: input.complaint,
                intuition: {
                    hypothesis: 'Potential Hazard',
                    confidence: 1.0,
                    reasoning: 'Semantic Layer Triggered',
                    investigationPlan: [],
                },
                authorityData: {
                    vin: input.vehicleContext.vin as string,
                    nhtsaRecalls: [],
                    manualSpecs: null,
                    safetyAlerts: semanticAssessment.hazards_detected,
                },
                visualGrounding: {
                    engineDescription: 'Gated',
                    isStock: true,
                    visualConflictDetected: false,
                    detectedCondition: 'unknown',
                },
                consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
                verification: {
                    isVerified: false,
                    verifiedSource: null,
                    searchQueryUsed: null,
                    conflictingEvidence: null,
                },
                finalDiagnosis: {
                    decision: 'STOP_DANGER',
                    reasoningTrace: `SEMANTIC_LAYER: Match found for ${semanticAssessment.hazards_detected[0]}`,
                    userOutput:
                        semanticAssessment.suggested_output ||
                        'SAFETY STOP: Potential hazard detected. Please follow the instructions.',
                    requiredActions: ['Stop current action', 'Follow safety instructions'],
                    metaConfidence: 1.0,
                },
            };
        }

        const actor = createActor(
            mechanicMachine.provide({
                actors: {
                    // New Actor: Generates Initial Hypothesis + Plan
                    generateIntuition: fromPromise(async ({ input }: { input: IntuitionInput }) => {
                        return this.generateIntuition(
                            input.userQuery,
                            input.vehicleContext,
                            input.nhtsaResults,
                            input.vehicleHistory,
                            input.userId,
                            input.sessionId,
                        );
                    }),
                    // Vision Actor: Now mostly for verification/grounding
                    visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => {
                        if (!input.data.videoUrl) return Promise.resolve(input.data.visualAnalysis as AIAnalysis); // Skip if no video

                        const ctx = input.data;
                        const reasoningInput: ReasoningInput = {
                            videoUrl: ctx.videoUrl,
                            vehicleContext: ctx.vehicleContext,
                            sessionId: ctx.sessionId,
                            userId: ctx.userId,
                            userQuery: ctx.userQuery,
                            localTriage: ctx.localTriage,
                        };
                        return this.runVisionAnalysis(
                            reasoningInput,
                            ctx.searchResults,
                            ctx.verificationResult,
                            ctx.vehicleHistory,
                            ctx.nhtsaResults as SafetyRecall[],
                        );
                    }),
                    nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => {
                        console.log('   [Actor] nhtsaCheck - STARTING');
                        const idx = input.data;
                        const result = await this.nhtsaService.checkRecalls(idx.year, idx.make, idx.model);
                        console.log('   [Actor] nhtsaCheck - COMPLETED with', result.length, 'recalls');
                        return result;
                    }),
                    vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
                        console.log('   [Actor] vectorSearch - STARTING');
                        try {
                            const result = await input.service.search(input.data.query, 3, {
                                userId: input.data.userId,
                            });
                            console.log('   [Actor] vectorSearch - COMPLETED with', result.length, 'results');
                            return result;
                        } catch (e) {
                            console.log('   [Actor] vectorSearch - FAILED', e);
                            this.logger.warn('Vector search failed', { error: e });
                            return [];
                        }
                    }),
                    googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
                        try {
                            return await this.searchService.search(input.data);
                        } catch (e) {
                            this.logger.warn('Google search failed', { error: e });
                            return { results: [], queryUsed: input.data.query, totalFound: 0 };
                        }
                    }),
                    webVerification: fromPromise(async ({ input }: { input: VerificationInput }) => {
                        return this.chatAI.verifyHypothesis(input.data);
                    }),
                    supermemorySearch: fromPromise(async ({ input }: { input: MemoryInput }) => {
                        console.log('   [Actor] supermemorySearch - STARTING');
                        try {
                            const query = `Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`;
                            const result = await input.service.search(query, {
                                tags: [MemoryTags.vin(input.data.vin || 'unknown')],
                            });
                            console.log('   [Actor] supermemorySearch - COMPLETED with', result.length, 'results');
                            return result;
                        } catch (e) {
                            console.log('   [Actor] supermemorySearch - FAILED', e);
                            this.logger.warn('Supermemory search failed', { error: e });
                            return [];
                        }
                    }),
                    // NEW: Combined actor for parallel context gathering (workaround for XState parallel state bug)
                    gatherAllContext: fromPromise(async ({ input }: { input: GatherAllContextInput }) => {
                        console.log('   [Actor] gatherAllContext - STARTING (Promise.all)');
                        const [recalls, history, vectors] = await Promise.all([
                            // NHTSA Recalls
                            (async () => {
                                try {
                                    const { year, make, model } = input.vehicleContext;
                                    return await input.services.nhtsa.checkRecalls(
                                        Number(year || 0),
                                        String(make || ''),
                                        String(model || ''),
                                    );
                                } catch (e) {
                                    console.log('   [gatherAllContext] NHTSA failed:', e);
                                    return [];
                                }
                            })(),
                            // Supermemory History
                            (async () => {
                                try {
                                    const query = `Vehicle VIN: ${input.vehicleContext.vin || 'Unknown'}. Component/Issue: ${input.userQuery}`;
                                    return await input.services.memory.search(query, {
                                        tags: MemoryTags.forVehicle(
                                            input.userId,
                                            String(input.vehicleContext.vin || 'unknown'),
                                        ),
                                    });
                                } catch (e) {
                                    console.log('   [gatherAllContext] Memory failed:', e);
                                    return [];
                                }
                            })(),
                            // Vector Search
                            (async () => {
                                try {
                                    return await input.services.vector.search(input.userQuery, 3, {
                                        userId: input.userId,
                                    });
                                } catch (e) {
                                    console.log('   [gatherAllContext] Vector failed:', e);
                                    return [];
                                }
                            })(),
                        ]);
                        console.log('   [Actor] gatherAllContext - COMPLETED', {
                            recalls: recalls.length,
                            history: history.length,
                            vectors: vectors.length,
                        });
                        return { recalls, history, vectors };
                    }),
                },
                actions: {
                    loadVisionModel: () => {
                        this.logger.debug('Initializing Vision Analysis resources');
                    },
                    unloadVisionModel: () => {
                        this.logger.debug('Releasing Vision Analysis resources');
                    },
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
                    services: {
                        vision: this.videoAI,
                        chat: this.chatAI,
                        nhtsa: this.nhtsaService,
                        vector: this.vectorRepo,
                        search: this.searchService,
                        memory: this.memoryService,
                    },
                },
                inspect: process.env.XSTATE_INSPECTOR === 'true' ? createBrowserInspector().inspect : undefined,
            },
        );

        if (process.env.XSTATE_INSPECTOR === 'true') {
            this.logger.info('[XState Inspector] Enabled - Connecting to Stately Studio', {
                sessionId: input.sessionId,
            });
        }

        actor.subscribe((state) => {
            this.logger.debug(`[MechanicMachine] State: ${JSON.stringify(state.value)}`, {
                error: state.context.error,
            });

            // XState Persistence: Save snapshot on every transition
            this.sessionRepo
                .saveXStateSnapshot(input.sessionId, state)
                .catch((err) =>
                    this.logger.warn('Failed to save XState snapshot', { error: err, sessionId: input.sessionId }),
                );
        });

        actor.start();

        // Brief delay to ensure actor is ready
        await new Promise((resolve) => setTimeout(resolve, 50));

        actor.send({
            type: 'DIAGNOSE',
            userQuery: input.userQuery,
            videoUrl: input.videoUrl,
            vehicleContext: input.vehicleContext,
            sessionId: input.sessionId,
            userId: input.userId,
            localTriage: input.localTriage,
        });

        const finalState = await waitFor(actor, (state) => state.matches('synthesizing'), { timeout: 120000 });

        // Clear persistence on completion
        await this.sessionRepo
            .clearXStateSnapshot(input.sessionId)
            .catch((err) =>
                this.logger.warn('Failed to clear XState snapshot', { error: err, sessionId: input.sessionId }),
            );

        const ctx = finalState.context;

        const visual = ctx.visualAnalysis || {
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
        const nhtsa = ctx.nhtsaResults || [];
        const similar = ctx.embeddingInfo || [];
        const verificationResult = ctx.verificationResult || {
            isVerified: false,
            source: null,
            reasoning: 'No verification run',
        };

        const reasoningLower = (verificationResult.reasoning || '').toLowerCase();
        const isExplicitConflict =
            !verificationResult.isVerified &&
            (reasoningLower.includes('electric') ||
                reasoningLower.includes('not') ||
                reasoningLower.includes('contradict') ||
                reasoningLower.includes('wrong'));

        const verification: VerificationData = {
            isVerified: verificationResult.isVerified,
            verifiedSource: verificationResult.source || null,
            searchQueryUsed: ctx.searchResults?.queryUsed || null,
            conflictingEvidence: isExplicitConflict ? verificationResult.reasoning : null,
        };

        const reflexionResult = this.synthesizeReflexion(
            visual,
            nhtsa as SafetyRecall[],
            similar,
            verification,
            ctx.localTriage,
        );

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
                nhtsaRecalls: (nhtsa as { Summary?: string }[]).map((r) => r.Summary || 'Unknown'),
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
            verification: verification,
            finalDiagnosis: reflexionResult,
        };

        if (state.intuition.confidence > 0.8 && state.finalDiagnosis.decision === 'PROCEED') {
            this.saveToMemory(state.complaint || input.userQuery, state, input.userId, input.sessionId).catch((err) =>
                this.logger.error('Failed to save individual case to collective memory', err),
            );
        }

        return state;
    }

    private async generateIntuition(
        query: string,
        vehicleContext: ReasoningInput['vehicleContext'],
        recalls: SafetyRecall[],
        history: MemorySearchResult[],
        userId: string,
        sessionId: string,
    ): Promise<AIAnalysis> {
        const selectedModel = getModelForState('intuition');
        this.logger.info('[MechanicReasoning] Generating Intuition (System 2)', {
            sessionId,
            model: selectedModel,
            modelReason: 'Deep diagnostic reasoning requires Pro model',
        });

        // 1. Construct ASE Master Tech Prompt with FULL Context
        const recallText =
            recalls.length > 0
                ? recalls.map((r) => `- [${r.Component}] ${r.Summary} (Remedy: ${r.Remedy})`).join('\n')
                : 'No active recalls found.';

        const historyText =
            history.length > 0 ? history.map((h) => `- ${h.content}`).join('\n') : 'No relevant vehicle history.';

        const prompt = `
        You are an ASE Certified Master Technician with 20+ years of experience.
        You are diagnosing a vehicle issue based on a User Query, Vehicle Context, Official Recalls, and Service History.

        STEP 1: ANALYZE RECALLS
        Check if the 'Official Recalls' list matches the symptoms in the 'User Query'. 
        If there is a match, this is your primary hypothesis.

        STEP 2: FORMULATE HYPOTHESIS
        If no recall matches, use your expert knowledge of this specific Make/Model to form a hypothesis.
        Consider common failure points for this vehicle (e.g., Ford F-150 IWEs, Cam Phasers).

        STEP 3: CREATE DIAGNOSTIC PLAN
        List 3-5 specific checks to verify your hypothesis.
        - Physical checks (e.g., "Check vacuum lines")
        - Research checks (e.g., "Search for TSB 12-34-56")

        OUTPUT FORMAT: JSON ONLY
        {
            "diagnosis": "Short title of the issue",
            "confidence": 0.0 to 1.0,
            "reasoning": "Detailed explanation of why you suspect this.",
            "investigationPlan": ["Step 1", "Step 2", ...],
            "severity": "low" | "medium" | "high" | "critical",
            "safety_alert": boolean,
            "suggested_actions": ["Repair X", "Inspect Y"],
            "engineDescription": "N/A",
            "isStock": true,
            "visualConflictDetected": false,
            "detectedCondition": "unknown",
            "visual_evidence": [],
            "acoustic_evidence": []
        }

        DATA:
        User Query: "${query}"
        Vehicle: ${JSON.stringify(vehicleContext)}
        Official Recalls:
        ${recallText}
        Service History:
        ${historyText}
        `;

        try {
            // 2. Get Pro model for deep reasoning (via ModelRouter)
            const model = this.coreAdapter.getGenerativeModel(
                selectedModel,
                this.coreAdapter.commonTools,
                this.coreAdapter.commonSafetySettings,
            );

            // 3. Call with Thinking Config (High Reasoning Effort)
            const generateConfig = {
                thinkingConfig: {
                    thinkingBudget: 10000,
                    includeThoughts: false,
                },
                temperature: 0.2,
                responseMimeType: 'application/json' as const,
            };

            const response = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: generateConfig,
            });

            // 4. Parse JSON from response
            const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonStr = text
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            const result = JSON.parse(jsonStr);

            // Validate/Fill defaults
            return {
                diagnosis: result.diagnosis || 'Unknown Issue',
                confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
                reasoning: result.reasoning || 'Analysis complete.',
                investigationPlan: Array.isArray(result.investigationPlan)
                    ? result.investigationPlan
                    : ['Perform visual inspection'],
                severity: result.severity || 'low',
                safety_alert: !!result.safety_alert,
                suggested_actions: Array.isArray(result.suggested_actions) ? result.suggested_actions : [],
                engineDescription: 'N/A',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
                visual_evidence: [],
                acoustic_evidence: [],
            };
        } catch (error) {
            this.logger.error('Failed to generate intuition', error as Error);
            // Fallback
            return {
                diagnosis: 'Complex Issue',
                confidence: 0.1,
                reasoning: 'Failed to generate detailed intuition.',
                investigationPlan: ['Consult manual', 'Check codes'],
                severity: 'low',
                safety_alert: false,
                suggested_actions: ['Consult human mechanic'],
                engineDescription: 'N/A',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
                visual_evidence: [],
                acoustic_evidence: [],
            };
        }
    }

    private synthesizeReflexion(
        intuition: AIAnalysis,
        recalls: SafetyRecall[],
        consensus: unknown[],
        verification: VerificationData,
        localTriage?: { detections: LocalTriageDetection[] },
    ): NeurosymbolicState['finalDiagnosis'] {
        const decisionTrace: string[] = [];
        const activeRecalls = recalls || [];
        let diagnosis = intuition.diagnosis;
        let actions = intuition.suggested_actions || [];

        if (localTriage?.detections?.length) {
            const highConfDetections = localTriage.detections.filter((d) => (d.confidence || 0) > 0.8);
            if (highConfDetections.length > 0) {
                const parts = highConfDetections.map((d) => d.id?.obj || 'unknown').join(', ');
                decisionTrace.push(`LOCAL GROUNDING: On-device triage confirmed ${parts} with high confidence.`);
            }
        }

        // RECALL BOOST: If AI already suspects a recall-related part, align it
        const recallMatch = activeRecalls.find(
            (r) =>
                diagnosis.toLowerCase().includes(r.Component.toLowerCase()) ||
                (r.Summary &&
                    diagnosis
                        .toLowerCase()
                        .split(' ')
                        .some((word) => r.Summary.toLowerCase().includes(word) && word.length > 3)),
        );

        if (recallMatch) {
            decisionTrace.push(`RECALL MATCH: Symptoms align with Recall on ${recallMatch.Component}.`);
            diagnosis = `RECALL IDENTIFIED: ${recallMatch.Component}. ${recallMatch.Summary}`;
            actions = [recallMatch.Remedy || 'Contact your local dealer for a free repair.', ...actions];
        } else if (activeRecalls.length > 0) {
            decisionTrace.push(
                `ALERT: Found ${activeRecalls.length} active recalls. No direct match found to current symptoms.`,
            );
        }

        if (verification.conflictingEvidence) {
            const conflict = verification.conflictingEvidence;
            decisionTrace.push('CRITICAL CONFLICT: Ground truth contradicts intuition.');
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: `CONFLICT DETECTED: My initial analysis suggests "${diagnosis}", but technical records indicate: ${conflict}. This requires human verification to avoid incorrect repair.`,
                requiredActions: ['Consult Human Mechanic', 'Verify with Technical Manual'],
                metaConfidence: 0.5,
            };
        }

        const metaConfidence = this.calculateMetaConfidence(
            intuition,
            recalls,
            consensus,
            verification,
            localTriage,
            !!recallMatch,
        );
        decisionTrace.push(`META-COGNITION: Final confidence calculated at ${(metaConfidence * 100).toFixed(1)}%`);

        // RELAXED THRESHOLDS: Only punt if absolutely zero grounding and very low confidence
        if (metaConfidence < 0.3 && !recallMatch && !verification.isVerified) {
            // ITERATIVE FALLBACK: Request More Info instead of referring to human immediately
            const typedIntuition = intuition as DeepPartial<AIAnalysis>;
            if (typedIntuition.investigationPlan && typedIntuition.investigationPlan.length > 0) {
                decisionTrace.push('LOW CONFIDENCE: Initiating iterative diagnosis request.');
                return {
                    decision: 'REQUEST_MORE_INFO',
                    reasoningTrace: decisionTrace.join('\n'),
                    userOutput: `I have a hypothesis (${diagnosis}), but I need you to check a few things to be sure:\n\n${typedIntuition.investigationPlan.map((step) => `- ${step}`).join('\n')}\n\nCan you perform these checks and tell me what you find?`,
                    requiredActions: typedIntuition.investigationPlan as string[],
                    metaConfidence: metaConfidence,
                };
            }

            decisionTrace.push('LOW CONFIDENCE: No grounding found and initial intuition is extremely weak.');
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput:
                    "I'm having trouble forming a confident diagnosis with the available information. To be safe, I recommend consulting a human mechanic for a physical inspection.",
                requiredActions: ['Consult Human Mechanic'],
                metaConfidence: metaConfidence,
            };
        }

        const strongConsensusContradiction =
            consensus.length > 2 &&
            (consensus[0] as { text: string }).text !== intuition.diagnosis &&
            !verification.isVerified;
        if (strongConsensusContradiction) {
            decisionTrace.push(
                'COMPLEX CONFLICT: Consensus strongly contradicts intuition, but verification is inconclusive. Referring to human.',
            );
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput:
                    'My analysis conflicts with strong community consensus, and I cannot verify a definitive solution. Please refer to a human expert.',
                requiredActions: ['Consult Human Mechanic'],
                metaConfidence: 0.4,
            };
        }

        let userOutput = verification.isVerified ? `${diagnosis} (Verified by external data)` : diagnosis;

        if (activeRecalls.length > 0 && !recallMatch) {
            const firstRecall = activeRecalls[0];
            if (!diagnosis.toLowerCase().includes('recall')) {
                userOutput += `\n\n⚠️ NOTE: While not directly related to your current symptoms, we found ${activeRecalls.length} active recall(s) for your vehicle (e.g., ${firstRecall.Component}). You should check these with your dealer.`;
            }
        }

        decisionTrace.push('Proceeding with best-effort diagnosis.');

        let decision: 'PROCEED' | 'STOP_DANGER' | 'REFER_TO_HUMAN' = 'PROCEED';
        if (intuition.safety_alert || intuition.severity === 'critical') {
            decision = 'STOP_DANGER';
            decisionTrace.push('SAFETY STOP: AI identified a critical safety issue.');
        }

        return {
            decision,
            reasoningTrace: decisionTrace.join('\n'),
            userOutput,
            requiredActions: actions,
            metaConfidence,
        };
    }

    private calculateMetaConfidence(
        intuition: AIAnalysis,
        recalls: unknown[],
        consensus: unknown[],
        verification: VerificationData,
        localTriage?: { detections: LocalTriageDetection[] },
        hasRecallMatch: boolean = false,
    ): number {
        let score = intuition.confidence * 0.5;
        if (verification.isVerified) score += 0.4;
        else if (verification.conflictingEvidence) score -= 0.2;
        if (consensus.length > 0) score += 0.1;
        if (hasRecallMatch) score += 0.3; // Significant boost for recall matches

        if (localTriage?.detections?.length && intuition.diagnosis) {
            const match = localTriage.detections.find(
                (d) =>
                    (d.confidence || 0) > 0.7 &&
                    d.id?.obj &&
                    intuition.diagnosis.toLowerCase().includes(d.id.obj.toLowerCase()),
            );
            if (match) score = Math.min(1.0, score + 0.1);
        }

        return Math.max(0, Math.min(1, score));
    }

    private async runVisionAnalysis(
        input: ReasoningInput,
        searchContext?: SearchResponse,
        verificationContext?: VerificationResponse,
        vehicleHistory?: MemorySearchResult[],
        recalls: SafetyRecall[] = [],
    ): Promise<AIAnalysis> {
        // STEP 0: Check for Local Model Results (SmolVLM2 on-device triage)
        if (input.localTriage && (input.localTriage.confidence || 0) > 0.7) {
            const selectedModel = getModelForState('vision_verifying');
            this.logger.info('[MechanicReasoning] Using Local Model Results (System 1)', {
                sessionId: input.sessionId,
                model: selectedModel,
                modelReason: 'On-device triage with high confidence',
                localConfidence: input.localTriage.confidence,
                costSavings: '$0.00',
            });

            // Convert LocalTriageResult to AIAnalysis format
            return {
                diagnosis: input.localTriage.primaryIssue || 'Unknown (Local)',
                confidence: input.localTriage.confidence || 0.7,
                reasoning: input.localTriage.reasoning || 'Detected via local model',
                investigationPlan: [],
                severity: input.localTriage.safetyConcern ? 'high' : 'medium',
                safety_alert: !!input.localTriage.safetyConcern,
                suggested_actions: input.localTriage.componentsMentioned || [],
                engineDescription: 'Analyzed via local model',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
                visual_evidence: [],
                acoustic_evidence: [],
            };
        }

        this.logger.info('[MechanicReasoning] Local triage unavailable or low confidence, using Cloud Flash', {
            sessionId: input.sessionId,
            model: 'gemini-2.5-flash',
            modelReason: 'Fallback for vision analysis',
            localTriageAvailable: !!input.localTriage,
            localConfidence: input.localTriage?.confidence ?? 0,
        });

        // STEP 1: Build Enhanced Context
        let enhancedContext = JSON.stringify(input.vehicleContext);

        if (vehicleHistory && vehicleHistory.length > 0) {
            const historyString = vehicleHistory.map((h) => h.content).join('\n---\n');
            enhancedContext += `\n\nVEHICLE HISTORY / PAST DIAGNOSTICS:\n${historyString}\n\nINSTRUCTION: Consider the history above when diagnosing the current issue. If a part was recently replaced, it might still be under warranty or could be a faulty new part.`;
        }

        if (recalls && recalls.length > 0) {
            const recallString = recalls
                .map((r) => `Component: ${r.Component}, Summary: ${r.Summary}, Remedy: ${r.Remedy}`)
                .join('\n');
            enhancedContext += `\n\nACTIVE RECALLS found for this vehicle:\n${recallString}\n\nINSTRUCTION: Check if any of these recalls match the user's symptoms. If yes, the recall IS the diagnosis. If no, diagnose the symptoms normally but mention the recall as a secondary note.`;
        }

        if (searchContext && searchContext.results && searchContext.results.length > 0) {
            const searchString = searchContext.results
                .map((r) => `Title: ${r.title}\nSnippet: ${r.snippet}`)
                .join('\n---\n');
            enhancedContext += `\n\nWEB SEARCH RESULTS:\n${searchString}\n\nINSTRUCTION: Use these search results to verify or refine your diagnosis.`;
        }

        if (!input.videoUrl) {
            return this.analyzeTextOnlyDiagnosis(input, enhancedContext, verificationContext);
        }

        return await this.videoAI.analyzeUploadedVideo(
            input.videoUrl,
            enhancedContext,
            'video/mp4',
            input.userId,
            input.sessionId,
            'high',
            input.videoDurationMinutes,
        );
    }

    private async analyzeTextOnlyDiagnosis(
        input: ReasoningInput,
        context: string,
        verification?: VerificationResponse,
    ): Promise<AIAnalysis> {
        const prompt = MechanicPrompts.textDiagnosis(input.userQuery, context, JSON.stringify(verification));
        try {
            const response = await this.chatAI.generateReply(
                [{ role: 'user', content: prompt }],
                prompt,
                JSON.stringify(input.vehicleContext),
                null,
                input.userId,
                input.sessionId,
            );

            const text = Array.isArray(response) ? response.map((p) => p.text).join('') : response;
            // Clean markdown json
            const jsonStr = text
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            return JSON.parse(jsonStr) as AIAnalysis;
        } catch (e) {
            this.logger.error('Text-only diagnosis failed', e as Error);
            return {
                diagnosis: verification?.isVerified ? 'Verified via Research' : 'Unknown Issue',
                confidence: 0.1,
                visual_evidence: [],
                acoustic_evidence: [],
                severity: 'low',
                safety_alert: false,
                suggested_actions: ['Consult a mechanic'],
                engineDescription: 'Failed to analyze text',
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
                reasoning: 'Text analysis failed',
                investigationPlan: [],
            };
        }
    }

    private async saveToMemory(text: string, state: NeurosymbolicState, userId: string, sessionId: string) {
        const vector = await this.embeddingService.embed(text);

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: state.authorityData.vin || 'unknown',
            timestamp: new Date().toISOString(),
        });

        const diagnosticLog = `
[DIAGNOSTIC LOG]
Date: ${new Date().toISOString()}
User Query: ${text}
Vehicle VIN: ${state.authorityData.vin || 'Unknown'}
Final Diagnosis: ${state.finalDiagnosis.userOutput}
Reasoning Trace: ${state.finalDiagnosis.reasoningTrace}
Required Actions: ${state.finalDiagnosis.requiredActions.join(', ')}
Meta Confidence: ${state.finalDiagnosis.metaConfidence}
        `.trim();

        const isolationTags = MemoryTags.forVehicle(userId, state.authorityData.vin || 'unknown');

        try {
            // 1. Save the text log
            await this.memoryService.addDocument({
                content: diagnosticLog,
                tags: [
                    MemoryTags.type('diagnostic'),
                    ...isolationTags,
                    ...(state.verification.isVerified
                        ? [MemoryTags.status('verified')]
                        : [MemoryTags.status('session')]),
                ],
                metadata: {
                    sessionId,
                    isVerified: state.verification.isVerified,
                },
            });

            // 2. If verified, save multimedia artifacts
            if (state.verification.isVerified) {
                const session = await this.sessionRepo.findById(sessionId);
                if (session) {
                    // Save video if present
                    if (session.videoUrl) {
                        await this.memoryService
                            .addDocument({
                                url: session.videoUrl,
                                tags: [MemoryTags.type('observation'), ...isolationTags, MemoryTags.status('verified')],
                                metadata: { sessionId, artifactType: 'video' },
                            })
                            .catch((e) => this.logger.warn('Failed to ingest session video', { error: e }));
                    }

                    // Save images from messages
                    const imageUrls = new Set<string>();
                    session.messages.forEach((msg) => {
                        if (Array.isArray(msg.content)) {
                            msg.content.forEach((part) => {
                                if (part.type === 'image' && part.image) imageUrls.add(part.image);
                            });
                        }
                    });

                    for (const url of imageUrls) {
                        await this.memoryService
                            .addDocument({
                                url,
                                tags: [MemoryTags.type('observation'), ...isolationTags, MemoryTags.status('verified')],
                                metadata: { sessionId, artifactType: 'image' },
                            })
                            .catch((e) => this.logger.warn('Failed to ingest session image', { error: e, url }));
                    }
                }
            }

            this.logger.info('Diagnostic session saved to Supermemory', { vin: state.authorityData.vin, sessionId });
        } catch (error) {
            this.logger.error('Failed to save to Supermemory', error as Error);
        }
    }
}
