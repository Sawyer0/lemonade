import type {
    IReactiveSafetyService,
    ISafetyMonitor,
    ILogger,
    NeurosymbolicState,
    ReasoningInput,
    SafetyAssessment,
} from '@lemonade/core';

type SafetyLayer = 'REACTIVE' | 'SEMANTIC';

const LAYER_COPY: Record<
    SafetyLayer,
    { hypothesis: string; reasoning: string; fallbackOutput: string; requiredActions: string[] }
> = {
    REACTIVE: {
        hypothesis: 'Immediate Hazard',
        reasoning: 'Reactive Layer Triggered',
        fallbackOutput: 'CRITICAL SAFETY STOP: Immediate hazard detected. Do not proceed.',
        requiredActions: ['Evacuate area', 'Follow safety instructions'],
    },
    SEMANTIC: {
        hypothesis: 'Potential Hazard',
        reasoning: 'Semantic Layer Triggered',
        fallbackOutput: 'SAFETY STOP: Potential hazard detected. Please follow the instructions.',
        requiredActions: ['Stop current action', 'Follow safety instructions'],
    },
};

/** The STOP_DANGER state returned when a safety layer blocks diagnosis. */
export function buildSafetyStopState(
    input: ReasoningInput,
    layer: SafetyLayer,
    assessment: SafetyAssessment,
): NeurosymbolicState {
    const copy = LAYER_COPY[layer];
    return {
        complaint: input.complaint,
        intuition: {
            hypothesis: copy.hypothesis,
            confidence: 1.0,
            reasoning: copy.reasoning,
            investigationPlan: [],
        },
        authorityData: {
            vin: input.vehicleContext.vin as string,
            nhtsaRecalls: [],
            manualSpecs: null,
            safetyAlerts: assessment.hazards_detected,
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
            reasoningTrace: `${layer}_LAYER: Match found for ${assessment.hazards_detected[0]}`,
            userOutput: assessment.suggested_output || copy.fallbackOutput,
            requiredActions: copy.requiredActions,
            metaConfidence: 1.0,
        },
    };
}

/**
 * Runs the two safety layers before any diagnosis: the rule-based reactive layer,
 * then the model-based semantic layer. Returns a STOP_DANGER state when either
 * blocks, otherwise null.
 */
export class DiagnosisSafetyGate {
    constructor(
        private readonly reactiveSafety: IReactiveSafetyService,
        private readonly safetyMonitor: ISafetyMonitor,
        private readonly logger: ILogger,
    ) {}

    async check(input: ReasoningInput): Promise<NeurosymbolicState | null> {
        const reactiveAssessment = this.reactiveSafety.checkSafety(input.userQuery);
        if (reactiveAssessment && reactiveAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Reactive Safety Triggered', {
                sessionId: input.sessionId,
                hazard: reactiveAssessment.hazards_detected,
            });
            return buildSafetyStopState(input, 'REACTIVE', reactiveAssessment);
        }

        const semanticAssessment = await this.safetyMonitor.assess(
            input.userQuery,
            JSON.stringify(input.vehicleContext),
        );
        if (semanticAssessment.intervention_required) {
            this.logger.warn('[MechanicReasoning] Semantic Safety Triggered', {
                sessionId: input.sessionId,
                hazard: semanticAssessment.hazards_detected,
            });
            return buildSafetyStopState(input, 'SEMANTIC', semanticAssessment);
        }

        return null;
    }
}
