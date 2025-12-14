import { injectable, inject } from 'inversify';
import type {
    IMechanicReasoningService,
    ReasoningInput,
    INHTSAService,
    IEmbeddingService,
    IVectorRepository,
    IGoogleSearchService,
    IMultimodalUploadAnalyzer,
    IChatAssistantAI,
    AIAnalysis,
    ILogger,
    NeurosymbolicState,
    VerificationData,
    VisionInput,
    NhtsaInput,
    VectorInput,
    WebInput
} from '@lemonade/core';
import { mechanicMachine } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { createActor, waitFor, fromPromise } from 'xstate';

@injectable()
export class MechanicReasoningService implements IMechanicReasoningService {
    constructor(
        @inject(TYPES.MultimodalUploadAI) private videoAI: IMultimodalUploadAnalyzer,
        @inject(TYPES.ChatAI) private chatAI: IChatAssistantAI,
        @inject(TYPES.NHTSAService) private nhtsaService: INHTSAService,
        @inject(TYPES.EmbeddingService) private embeddingService: IEmbeddingService,
        @inject(TYPES.VectorRepository) private vectorRepo: IVectorRepository,
        @inject(TYPES.GoogleSearchService) private searchService: IGoogleSearchService,
        @inject(TYPES.Logger) private logger: ILogger
    ) { }

    async diagnose(input: ReasoningInput): Promise<NeurosymbolicState> {
        this.logger.info('[MechanicReasoning] Starting System 2 Diagnosis Loop (XState)', { sessionId: input.sessionId });

        const actor = createActor(mechanicMachine.provide({
            actors: {
                visionAnalysis: fromPromise(async ({ input }: { input: VisionInput }) => {
                    const ctx = input.data;
                    const reasoningInput: ReasoningInput = {
                        videoUrl: ctx.videoUrl,
                        vehicleContext: ctx.vehicleContext as { year: number; make: string; model: string; vin?: string },
                        sessionId: ctx.sessionId,
                        userId: ctx.userId,
                        userQuery: ctx.userQuery
                    };
                    return this.runVisionAnalysis(reasoningInput);
                }),
                nhtsaCheck: fromPromise(async ({ input }: { input: NhtsaInput }) => {
                    const idx = input.data;
                    return this.nhtsaService.checkRecalls(idx.year, idx.make, idx.model);
                }),
                vectorSearch: fromPromise(async ({ input }: { input: VectorInput }) => {
                    const embedding = await this.embeddingService.embed(input.data.query);
                    return this.vectorRepo.findSimilar(embedding, 3, { userId: input.data.userId });
                }),
                webVerification: fromPromise(async ({ input }: { input: WebInput }) => {
                    const data = input.data;
                    return this.chatAI.verifyHypothesis(input.data);
                })
            }
        }), {
            input: {
                userQuery: input.userQuery,
                videoUrl: input.videoUrl,
                vehicleContext: input.vehicleContext,
                sessionId: input.sessionId,
                userId: input.userId,
                services: {
                    vision: this.videoAI,
                    chat: this.chatAI,
                    nhtsa: this.nhtsaService,
                    vector: this.vectorRepo,
                    search: this.searchService
                }
            }
        });

        actor.start();
        actor.send({
            type: 'DIAGNOSE',
            userQuery: input.userQuery,
            videoUrl: input.videoUrl,
            vehicleContext: input.vehicleContext,
            sessionId: input.sessionId,
            userId: input.userId
        });

        const finalState = await waitFor(actor, (state) => state.matches('synthesizing'));
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
        // Map verification to satisfy NeurosymbolicState verification type: { isVerified: boolean; verifiedSource: string | null; searchQueryUsed?: string | null }
        const verificationResult = ctx.verificationResult || { isVerified: false, source: null, reasoning: "No verification run" };
        const verification = {
            isVerified: verificationResult.isVerified,
            verifiedSource: verificationResult.source || verificationResult.reasoning || null,
            searchQueryUsed: ctx.searchResults?.queryUsed || null,
            conflictingEvidence: null
        };

        const reflexionResult = this.synthesizeReflexion(
            visual,
            nhtsa as { Component: string; Summary: string; Consequence: string; Remedy: string }[],
            similar,
            verification
        );


        const state: NeurosymbolicState = {
            complaint: input.complaint,
            intuition: { hypothesis: visual.diagnosis, confidence: visual.confidence, reasoning: "XState Logic" },
            authorityData: { vin: input.vehicleContext.vin as string, nhtsaRecalls: (nhtsa as { Summary?: string }[]).map((r) => r.Summary || 'Unknown'), manualSpecs: null, safetyAlerts: [] },
            visualGrounding: { engineDescription: "Analzyed", isStock: true, visualConflictDetected: false, detectedCondition: 'unknown' },
            consensus: { similarCasesFound: similar.length, consensusFix: similar.length > 0 ? (similar[0] as { text: string }).text : null, isKnownIssue: similar.length > 1 },
            verification: verification,
            finalDiagnosis: reflexionResult
        };

        // Learning Step
        if (state.intuition.confidence > 0.8 && state.finalDiagnosis.decision === 'PROCEED') {
            this.saveToMemory(state.complaint || input.userQuery, state, input.userId).catch(err =>
                this.logger.error('Failed to save individual case to collective memory', err)
            );
        }

        return state;
    }

    private synthesizeReflexion(
        intuition: AIAnalysis,
        recalls: { Component: string; Summary: string; Consequence: string; Remedy: string; NHTSACampaignNumber?: string }[],
        consensus: unknown[],
        verification: VerificationData
    ): NeurosymbolicState['finalDiagnosis'] {
        const decisionTrace: string[] = [];

        // Step 1: Check Authority (NHTSA)
        if (recalls.length > 0) {
            decisionTrace.push(`CRITICAL: Found ${recalls.length} active recalls.`);
            const firstRecall = recalls[0];
            const recallDetails = `
**Component:** ${firstRecall.Component}
**Summary:** ${firstRecall.Summary}
**Consequence:** ${firstRecall.Consequence}
**Remedy:** ${firstRecall.Remedy}
**NHTSA Campaign Number:** ${firstRecall.NHTSACampaignNumber || 'N/A'}
`;
            return {
                decision: 'STOP_DANGER',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: `CRITICAL SAFETY ALERT: Active Recall Found. \n\n${recallDetails}\n\nDo not proceed. Contact Dealer.`,
                requiredActions: ["Contact Dealer", "Do not drive"]
            };
        }

        // Step 2: Check Visual Grounding
        if (intuition.visualConflictDetected) {
            decisionTrace.push("WARNING: Visual Discrepancy detected between vehicle context and image.");
            // Keep existing REQUEST_MORE_INFO for simple visual conflict, but also check for deeper ambiguity below.
        }


        if (intuition.confidence < 0.3) {
            decisionTrace.push("LOW CONFIDENCE: Initial AI intuition is very uncertain.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: "My initial assessment is highly uncertain. It would be best to consult a human mechanic for this issue.",
                requiredActions: ["Consult Human Mechanic"]
            };
        }

        if (intuition.visualConflictDetected && intuition.confidence < 0.5) {
            decisionTrace.push("SEVERE CONFLICT: Strong visual discrepancy with low confidence. Referring to human.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: "There's a significant visual conflict with low confidence in my analysis. This requires human inspection.",
                requiredActions: ["Consult Human Mechanic"]
            };
        }

        // Example: If consensus strongly contradicts intuition and verification is inconclusive
        const strongConsensusContradiction = consensus.length > 2 && (consensus[0] as { text: string }).text !== intuition.diagnosis && !verification.isVerified;
        if (strongConsensusContradiction) {
            decisionTrace.push("COMPLEX CONFLICT: Consensus strongly contradicts intuition, but verification is inconclusive. Referring to human.");
            return {
                decision: 'REFER_TO_HUMAN',
                reasoningTrace: decisionTrace.join('\n'),
                userOutput: "My analysis conflicts with strong community consensus, and I cannot verify a definitive solution. Please refer to a human expert.",
                requiredActions: ["Consult Human Mechanic"]
            };
        }

        if (verification.isVerified) {
            decisionTrace.push(`VERIFIED: External Search confirmed diagnosis via ${verification.verifiedSource}`);
        } else if (verification.searchQueryUsed) {
            decisionTrace.push("WARNING: External Search did not explicitly confirm the diagnosis.");
        }

        const strongConsensus = consensus.length > 2;
        if (strongConsensus) {
            decisionTrace.push(`CONSENSUS: Found ${consensus.length} similar resolved cases.`);
        }

        if (strongConsensus) {
            const topCase = consensus[0] as { text: string };
            if (topCase.text !== intuition.diagnosis) {
                decisionTrace.push("Conflict between AI Diagnosis and Community Fix. Prioritizing Community.");
                return {
                    decision: 'PROCEED', // Proceed but with caution/context
                    reasoningTrace: decisionTrace.join('\n'),
                    userOutput: `Community Insight: While this looks like standard ${intuition.diagnosis}, ${consensus.length} users fixed this by: ${topCase.text}. Check that first.`,
                    requiredActions: ["Check Community Fix"]
                };
            }
        }


        const verifiedOutput = verification.isVerified
            ? `${intuition.diagnosis} (Verified by external data)`
            : intuition.diagnosis;

        decisionTrace.push("All safety checks passed. Proceeding with Visual Diagnosis.");
        return {
            decision: 'PROCEED',
            reasoningTrace: decisionTrace.join('\n'),
            userOutput: verifiedOutput,
            requiredActions: intuition.suggested_actions || []
        };
    }

    private async runVisionAnalysis(input: ReasoningInput): Promise<AIAnalysis> {
        if (!input.videoUrl) {
            return {
                diagnosis: "No video provided. Unable to perform visual analysis.",
                visual_evidence: [],
                acoustic_evidence: [],
                severity: "low",
                safety_alert: false,
                suggested_actions: ["Upload a video for better accuracy"],
                engineDescription: "No visual data",
                isStock: true,
                visualConflictDetected: false,
                detectedCondition: 'unknown',
                confidence: 0.0
            };
        }

        return await this.videoAI.analyzeUploadedVideo(
            input.videoUrl,
            JSON.stringify(input.vehicleContext),
            'video/mp4',
            input.userId,
            input.sessionId,
            'high',
            input.videoDurationMinutes
        );
    }

    private async saveToMemory(text: string, state: NeurosymbolicState, userId: string) {
        const vector = await this.embeddingService.embed(text);

        await this.vectorRepo.addCase(text, vector, {
            userId: userId,
            diagnosis: state.finalDiagnosis.userOutput,
            vehicle: state.authorityData.vin || 'unknown',
            timestamp: new Date().toISOString()
        });

        if (state.verification.isVerified && state.intuition.confidence > 0.9) {
            await this.vectorRepo.addCase(text, vector, {
                isGlobal: true,
                diagnosis: state.finalDiagnosis.userOutput,
                vehicle_context: `${state.visualGrounding.engineDescription}`,
                type: 'VERIFIED_SOLUTION',
                timestamp: new Date().toISOString()
            });
            this.logger.info("Case promoted to Global Knowledge Base", { diagnosis: state.finalDiagnosis.userOutput });
        }
    }
}
