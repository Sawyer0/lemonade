import type {
    AIAnalysis,
    IChatAssistantAI,
    ILogger,
    IMultimodalUploadAnalyzer,
    MemorySearchResult,
    ReasoningInput,
    SafetyRecall,
    SearchResponse,
    VerificationResponse,
} from '@lemonade/core';
import { GEMINI_FLASH_MODEL, MechanicPrompts, getModelForState } from '@lemonade/core';
import { parseModelJson } from './modelJson';

const LOCAL_TRIAGE_TRUST_THRESHOLD = 0.7;

/** Folds history, recalls and web results into the context the vision or text model reads. */
export function buildEnhancedContext(
    vehicleContext: ReasoningInput['vehicleContext'],
    vehicleHistory: MemorySearchResult[] | undefined,
    recalls: SafetyRecall[],
    searchContext: SearchResponse | undefined,
): string {
    let enhancedContext = JSON.stringify(vehicleContext);

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

    return enhancedContext;
}

/**
 * Grounds the hypothesis in evidence. Trusts confident on-device triage first,
 * then analyzes the uploaded video, and falls back to a text-only diagnosis
 * when there is no video.
 */
export class EvidenceAnalyzer {
    constructor(
        private readonly videoAI: IMultimodalUploadAnalyzer,
        private readonly chatAI: IChatAssistantAI,
        private readonly logger: ILogger,
    ) {}

    async analyze(
        input: ReasoningInput,
        searchContext?: SearchResponse,
        verificationContext?: VerificationResponse,
        vehicleHistory?: MemorySearchResult[],
        recalls: SafetyRecall[] = [],
    ): Promise<AIAnalysis> {
        if (input.localTriage && (input.localTriage.confidence || 0) > LOCAL_TRIAGE_TRUST_THRESHOLD) {
            return this.fromLocalTriage(input);
        }

        this.logger.info('[MechanicReasoning] Local triage unavailable or low confidence, using Cloud Flash', {
            sessionId: input.sessionId,
            model: GEMINI_FLASH_MODEL,
            modelReason: 'Fallback for vision analysis',
            localTriageAvailable: !!input.localTriage,
            localConfidence: input.localTriage?.confidence ?? 0,
        });

        const enhancedContext = buildEnhancedContext(input.vehicleContext, vehicleHistory, recalls, searchContext);

        if (!input.videoUrl) {
            return this.analyzeText(input, enhancedContext, verificationContext);
        }

        return this.videoAI.analyzeUploadedVideo(
            input.videoUrl,
            enhancedContext,
            'video/mp4',
            input.userId,
            input.sessionId,
            'high',
            input.videoDurationMinutes,
        );
    }

    private fromLocalTriage(input: ReasoningInput): AIAnalysis {
        const triage = input.localTriage!;
        this.logger.info('[MechanicReasoning] Using Local Model Results (System 1)', {
            sessionId: input.sessionId,
            model: getModelForState('vision_verifying'),
            modelReason: 'On-device triage with high confidence',
            localConfidence: triage.confidence,
            costSavings: '$0.00',
        });

        return {
            diagnosis: triage.primaryIssue || 'Unknown (Local)',
            confidence: triage.confidence || 0.7,
            reasoning: triage.reasoning || 'Detected via local model',
            investigationPlan: [],
            severity: triage.safetyConcern ? 'high' : 'medium',
            safety_alert: !!triage.safetyConcern,
            suggested_actions: triage.componentsMentioned || [],
            engineDescription: 'Analyzed via local model',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown',
            visual_evidence: [],
            acoustic_evidence: [],
        };
    }

    private async analyzeText(
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
            return parseModelJson<AIAnalysis>(text);
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
}
