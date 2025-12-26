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
    ISafetyMonitor,
    ITracingService,
    IMultimodalUploadAnalyzer,
    IChatAssistantAI,
    AIAnalysis,
    ILogger,
    NeurosymbolicState,
    VerificationData,
    VisionInput,
    NhtsaInput,
    VectorInput,
    SearchInput,
    VerificationInput,
    MemoryInput,
    SearchResponse,
    VerificationResponse,
    MemorySearchResult,
    SafetyRecall
} from '@lemonade/core';
import { mechanicMachine } from '@lemonade/core';
import { createActor, waitFor, fromPromise } from 'xstate';
import { TYPES } from '../di/types';

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
        @inject(TYPES.ReactiveSafetyService) private reactiveSafety: IReactiveSafetyService,
        @inject(TYPES.SafetyMonitor) private safetyMonitor: ISafetyMonitor,
        @inject(TYPES.TracingService) private tracer: ITracingService,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async diagnose(input: ReasoningInput): Promise<NeurosymbolicState> {
        return this.tracer.traceAiCall({
            name: 'mechanic_system_2_diagnosis',
            runType: 'chain',
            inputs: {
                userQuery: input.userQuery,
                vehicleContext: input.vehicleContext,
                complaint: input.complaint
            },
            tags: ['neurosymbolic', 'diagnosis'],
            exec: () => this.runDiagnosis(input)
        });
    }

    private async runDiagnosis(input: ReasoningInput): Promise<NeurosymbolicState> {
        this.logger.info('[MechanicReasoning] Starting System 2 Diagnosis Loop (XState)', { sessionId: input.sessionId });

        // Phase 1: Reactive Layer (Immediate Safety Gating)
        const reactiveAssessment = this.reactiveSafety.checkSafety(input.userQuery);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Reactive Safety Triggered', {
                sessionId: input.sessionId,
                hazard: reactiveAssessment.hazards_detected
            });
            return {
                complaint: input.complaint,
                intuition: { hypothesis: "Immediate Hazard", confidence: 1.0, reasoning: "Reactive Layer Triggered" },
                authorityData: { vin: input.vehicleContext.vin as string, nhtsaRecalls: [], manualSpecs: null, safetyAlerts: reactiveAssessment.hazards_detected },
                visualGrounding: { engineDescription: "Gated", isStock: true, visualConflictDetected: false, detectedCondition: 'unknown' },
                consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
                verification: { isVerified: false, verifiedSource: null, searchQueryUsed: null, conflictingEvidence: null },
                finalDiagnosis: {
                    decision: 'STOP_DANGER',
                    reasoningTrace: `REACTIVE_LAYER: Match found for ${reactiveAssessment.hazards_detected[0]}`,
                    userOutput: reactiveAssessment.suggested_output || "CRITICAL SAFETY STOP: Immediate hazard detected. Do not proceed.",
                    requiredActions: ["Evacuate area", "Follow safety instructions"],
                    metaConfidence: 1.0
                }
            };
        }

        // Phase 2: Semantic Layer (SafetyMonitor System 1)
        const vehicleContextStr = JSON.stringify(input.vehicleContext);
        const semanticAssessment = await this.safetyMonitor.assess(input.userQuery, vehicleContextStr);
        if (semanticAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Semantic Safety Triggered', {
                sessionId: input.sessionId,
                hazard: semanticAssessment.hazards_detected
            });
            return {
                complaint: input.complaint,
                intuition: { hypothesis: "Potential Hazard", confidence: 1.0, reasoning: "Semantic Layer Triggered" },
                authorityData: { vin: input.vehicleContext.vin as string, nhtsaRecalls: [], manualSpecs: null, safetyAlerts: semanticAssessment.hazards_detected },
                visualGrounding: { engineDescription: "Gated", isStock: true, visualConflictDetected: false, detectedCondition: 'unknown' },
                consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
                verification: { isVerified: false, verifiedSource: null, searchQueryUsed: null, conflictingEvidence: null },
                finalDiagnosis: {
                    decision: 'STOP_DANGER',
                    reasoningTrace: `SEMANTIC_LAYER: Match found for ${semanticAssessment.hazards_detected[0]}`,
                    userOutput: semanticAssessment.suggested_output || "SAFETY STOP: Potential hazard detected. Please follow the instructions.",
                    requiredActions: ["Stop current action", "Follow safety instructions"],
                    metaConfidence: 1.0
                }
            };
        }

        const actor = createActor(mechanicMachine.provide({
            actors: {
                visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => {
                    const ctx = input.data;
                    const reasoningInput: ReasoningInput = {
                        videoUrl: ctx.videoUrl,
                        vehicleContext: ctx.vehicleContext as { year: number; make: string; model: string; vin?: string },
                        sessionId: ctx.sessionId,
                        userId: ctx.userId,
                        userQuery: ctx.userQuery,
                        localTriage: ctx.localTriage
                    };
                    return this.runVisionAnalysis(
                        reasoningInput,
                        ctx.searchResults,
                        ctx.verificationResult,
                        ctx.vehicleHistory,
                        ctx.nhtsaResults as SafetyRecall[]
                    );
                }),
                nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => {
                    const idx = input.data;
                    return this.nhtsaService.checkRecalls(idx.year, idx.make, idx.model);
                }),
                vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
                    try {
                        return await this.vectorRepo.search(input.data.query, 3, { userId: input.data.userId });
                    } catch (e) {
                        this.logger.warn("Vector search failed", { error: e });
                        return [];
                    }
                }),
                googleSearch: fromPromise(async ({ input }: { input: SearchInput }) => {
                    try {
                        return await this.searchService.search(input.data);
                    } catch (e) {
                        this.logger.warn("Google search failed", { error: e });
                        return { results: [], queryUsed: input.data.query, totalFound: 0 };
                    }
                }),
                webVerification: fromPromise(async ({ input }: { input: VerificationInput }) => {
                    return this.chatAI.verifyHypothesis(input.data);
                }),
                supermemorySearch: fromPromise(async ({ input }: { input: MemoryInput }) => {
                    try {
                        const query = `Vehicle VIN: ${input.data.vin || 'Unknown'}. Component/Issue: ${input.data.query}`;
                        return await this.memoryService.search(query);
                    } catch (e) {
                        this.logger.warn("Supermemory search failed", { error: e });
                        return [];
                    }
                })
            }
        }), {
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
                    memory: this.memoryService
                }
            }
        });

        actor.subscribe((state) => {
            this.logger.debug(`[MechanicMachine] State: ${JSON.stringify(state.value)}`, {
                error: state.context.error
            });
        });

        actor.start();

        // Brief delay to ensure actor is ready
        await new Promise(resolve => setTimeout(resolve, 50));

        actor.send({
            type: 'DIAGNOSE',
            userQuery: input.userQuery,
            videoUrl: input.videoUrl,
            vehicleContext: input.vehicleContext,
            sessionId: input.sessionId,
            userId: input.userId,
            localTriage: input.localTriage
        });

        const finalState = await waitFor(actor, (state) => state.matches('synthesizing'), { timeout: 10000 });
        const ctx = finalState.context;

        const visual = ctx.visualAnalysis || {
            diagnosis: "Unknown",
            confidence: 0,
            visual_evidence: [],
            acoustic_evidence: [],
            severity: "low",
            safety_alert: false,
            suggested_actions: [],
            engineDescription: "No visual analysis performed",
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown'
        };
        const nhtsa = ctx.nhtsaResults || [];
        const similar = ctx.embeddingInfo || [];
        const verificationResult = ctx.verificationResult || { isVerified: false, source: null, reasoning: "No verification run" };

        const reasoningLower = (verificationResult.reasoning || '').toLowerCase();
        const isExplicitConflict = !verificationResult.isVerified &&
            (reasoningLower.includes('electric') ||
                reasoningLower.includes('not') ||
                reasoningLower.includes('contradict') ||
                reasoningLower.includes('wrong'));

        const verification: VerificationData = {
            isVerified: verificationResult.isVerified,
            verifiedSource: verificationResult.source || null,
            searchQueryUsed: ctx.searchResults?.queryUsed || null,
            conflictingEvidence: isExplicitConflict ? verificationResult.reasoning : null
        };

        const reflexionResult = this.synthesizeReflexion(
            visual,
            nhtsa as SafetyRecall[],
            similar,
            verification,
            ctx.localTriage
        );

        const state: NeurosymbolicState = {
            complaint: input.complaint,
            intuition: { hypothesis: visual.diagnosis, confidence: visual.confidence, reasoning: "XState Logic" },
            authorityData: { vin: input.vehicleContext.vin as string, nhtsaRecalls: (nhtsa as { Summary?: string }[]).map((r) => r.Summary || 'Unknown'), manualSpecs: null, safetyAlerts: [] },
            visualGrounding: { engineDescription: "Analyzed", isStock: true, visualConflictDetected: false, detectedCondition: 'unknown' },
            consensus: { similarCasesFound: similar.length, consensusFix: similar.length > 0 ? (similar[0] as { text: string }).text : null, isKnownIssue: similar.length > 1 },
            verification: verification,
            finalDiagnosis: reflexionResult
        };

        if (state.intuition.confidence > 0.8 && state.finalDiagnosis.decision === 'PROCEED') {
            this.saveToMemory(state.complaint || input.userQuery, state, input.userId).catch(err =>
                this.logger.error('Failed to save individual case to collective memory', err)
            );
        }

        return state;
    }

    private synthesizeReflexion(
        intuition: AIAnalysis,
        recalls: SafetyRecall[],
        consensus: unknown[],
        verification: VerificationData,
        localTriage?: { detections: LocalTriageDetection[] }
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
        const recallMatch = activeRecalls.find(r =>
            diagnosis.toLowerCase().includes(r.Component.toLowerCase()) ||
            (r.Summary && diagnosis.toLowerCase().split(' ').some(word => r.Summary.toLowerCase().includes(word) && word.length > 3))
        );

        if (recallMatch) {
            decisionTrace.push(`RECALL MATCH: Symptoms align with Recall on ${recallMatch.Component}.`);
            diagnosis = `RECALL IDENTIFIED: ${recallMatch.Component}. ${recallMatch.Summary}`;
            actions = [recallMatch.Remedy || "Contact your local dealer for a free repair.", ...actions];
        } else if (activeRecalls.length > 0) {
            decisionTrace.push(`ALERT: Found ${activeRecalls.length} active recalls. No direct match found to current symptoms.`);
        }

        if (verification.conflictingEvidence) {
            const conflict = verification.conflictingEvidence;
            decisionTrace.push("CRITICAL CONFLICT: Ground truth contradicts intuition.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: `CONFLICT DETECTED: My initial analysis suggests "${diagnosis}", but technical records indicate: ${conflict}. This requires human verification to avoid incorrect repair.`,
                requiredActions: ["Consult Human Mechanic", "Verify with Technical Manual"],
                metaConfidence: 0.5
            };
        }

        const metaConfidence = this.calculateMetaConfidence(intuition, recalls, consensus, verification, localTriage, !!recallMatch);
        decisionTrace.push(`META-COGNITION: Final confidence calculated at ${(metaConfidence * 100).toFixed(1)}%`);

        // RELAXED THRESHOLDS: Only punt if absolutely zero grounding and very low confidence
        if (metaConfidence < 0.20 && !recallMatch && !verification.isVerified) {
            decisionTrace.push("LOW CONFIDENCE: No grounding found and initial intuition is extremely weak.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: "I'm having trouble forming a confident diagnosis with the available information. To be safe, I recommend consulting a human mechanic for a physical inspection.",
                requiredActions: ["Consult Human Mechanic"],
                metaConfidence: metaConfidence
            };
        }

        const strongConsensusContradiction = consensus.length > 2 && (consensus[0] as { text: string }).text !== intuition.diagnosis && !verification.isVerified;
        if (strongConsensusContradiction) {
            decisionTrace.push("COMPLEX CONFLICT: Consensus strongly contradicts intuition, but verification is inconclusive. Referring to human.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: "My analysis conflicts with strong community consensus, and I cannot verify a definitive solution. Please refer to a human expert.",
                requiredActions: ["Consult Human Mechanic"],
                metaConfidence: 0.4
            };
        }

        let userOutput = verification.isVerified
            ? `${diagnosis} (Verified by external data)`
            : diagnosis;

        if (activeRecalls.length > 0 && !recallMatch) {
            const firstRecall = activeRecalls[0];
            if (!diagnosis.toLowerCase().includes('recall')) {
                userOutput += `\n\n⚠️ NOTE: While not directly related to your current symptoms, we found ${activeRecalls.length} active recall(s) for your vehicle (e.g., ${firstRecall.Component}). You should check these with your dealer.`;
            }
        }

        decisionTrace.push("Proceeding with best-effort diagnosis.");

        let decision: 'PROCEED' | 'STOP_DANGER' | 'REFER_TO_HUMAN' = 'PROCEED';
        if (intuition.safety_alert || intuition.severity === 'critical') {
            decision = 'STOP_DANGER';
            decisionTrace.push("SAFETY STOP: AI identified a critical safety issue.");
        }

        return {
            decision,
            reasoningTrace: decisionTrace.join('\n'),
            userOutput,
            requiredActions: actions,
            metaConfidence
        };
    }

    private calculateMetaConfidence(
        intuition: AIAnalysis,
        recalls: unknown[],
        consensus: unknown[],
        verification: VerificationData,
        localTriage?: { detections: LocalTriageDetection[] },
        hasRecallMatch: boolean = false
    ): number {
        let score = intuition.confidence * 0.5;
        if (verification.isVerified) score += 0.4;
        else if (verification.conflictingEvidence) score -= 0.2;
        if (consensus.length > 0) score += 0.1;
        if (hasRecallMatch) score += 0.3; // Significant boost for recall matches

        if (localTriage?.detections?.length && intuition.diagnosis) {
            const match = localTriage.detections.find((d) =>
                (d.confidence || 0) > 0.7 &&
                d.id?.obj &&
                intuition.diagnosis.toLowerCase().includes(d.id.obj.toLowerCase())
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
        recalls: SafetyRecall[] = []
    ): Promise<AIAnalysis> {
        let enhancedContext = JSON.stringify(input.vehicleContext);

        if (vehicleHistory && vehicleHistory.length > 0) {
            const historyString = vehicleHistory.map(h => h.content).join('\n---\n');
            enhancedContext += `\n\nVEHICLE HISTORY / PAST DIAGNOSTICS:\n${historyString}\n\nINSTRUCTION: Consider the history above when diagnosing the current issue. If a part was recently replaced, it might still be under warranty or could be a faulty new part.`;
        }

        if (recalls && recalls.length > 0) {
            const recallString = recalls.map(r => `Component: ${r.Component}, Summary: ${r.Summary}, Remedy: ${r.Remedy}`).join('\n');
            enhancedContext += `\n\nACTIVE RECALLS found for this vehicle:\n${recallString}\n\nINSTRUCTION: Check if any of these recalls match the user's symptoms. If yes, the recall IS the diagnosis. If no, diagnose the symptoms normally but mention the recall as a secondary note.`;
        }

        if (searchContext && searchContext.results && searchContext.results.length > 0) {
            const searchString = searchContext.results.map(r => `Title: ${r.title}\nSnippet: ${r.snippet}`).join('\n---\n');
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
            input.videoDurationMinutes
        );
    }

    private async analyzeTextOnlyDiagnosis(
        input: ReasoningInput,
        context: string,
        verification?: VerificationResponse
    ): Promise<AIAnalysis> {
        const prompt = `
You are the Lemonade Master Technician.
User Query: "${input.userQuery}"
Vehicle Context: ${context}
Verification Info: ${JSON.stringify(verification)}

Task: Diagnose the issue based on the text description and context.
- Prioritize SAFETY.
- If an active recall matches the symptoms, that is the Primary Diagnosis.
- If recalls are unrelated, diagnose based on symptoms.

Output strictly valid JSON matching this schema:
{
    "diagnosis": "string",
    "visual_evidence": [],
    "acoustic_evidence": [],
    "severity": "low" | "medium" | "high" | "critical",
    "safety_alert": boolean,
    "suggested_actions": ["action1", "action2"],
    "engineDescription": "Text-based analysis",
    "isStock": true,
    "visualConflictDetected": false,
    "detectedCondition": "unknown",
    "confidence": number (0-1)
}
`;
        try {
            const response = await this.chatAI.generateReply(
                [{ role: 'user', content: prompt }],
                prompt,
                JSON.stringify(input.vehicleContext),
                null,
                input.userId,
                input.sessionId
            );

            const text = Array.isArray(response) ? response.map(p => p.text).join('') : response;
            // Clean markdown json
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonStr) as AIAnalysis;
        } catch (e) {
            this.logger.error("Text-only diagnosis failed", e as Error);
            return {
                diagnosis: verification?.isVerified ? "Verified via Research" : "Unknown Issue",
                confidence: 0.1,
                visual_evidence: [],
                acoustic_evidence: [],
                severity: "low",
                safety_alert: false,
                suggested_actions: ["Consult a mechanic"],
                engineDescription: "Failed to analyze text",
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown'
            };
        }
    }

    private async saveToMemory(text: string, state: NeurosymbolicState, userId: string) {
        const vector = await this.embeddingService.embed(text);

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: state.authorityData.vin || 'unknown',
            timestamp: new Date().toISOString()
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

        try {
            await this.memoryService.addDocument(
                diagnosticLog,
                ['diagnostic', `vin:${state.authorityData.vin || 'unknown'}`, `user:${userId}`]
            );
            this.logger.info("Diagnostic session saved to Supermemory", { vin: state.authorityData.vin });
        } catch (error) {
            this.logger.error("Failed to save to Supermemory", error as Error);
        }

        if (state.verification.isVerified && state.intuition.confidence > 0.9) {
            await this.vectorRepo.addCase(text, vector, {
                isGlobal: true,
                diagnosis: state.finalDiagnosis.userOutput,
                vehicle_context: `${state.visualGrounding.engineDescription}`,
                type: 'VERIFIED_SOLUTION',
                timestamp: new Date().toISOString()
            });
        }
    }
}