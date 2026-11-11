import type {
    IReactiveSafetyService,
    ISafetyMonitor,
    ILogger,
    NeurosymbolicState,
    PreActionDecision,
    PreActionHook,
    PhysicalStep,
    ReasoningInput,
    SafetyAssessment,
    StepOrigin,
} from '@lemonade/core';
import { authorizeStep, type ConfirmationStore, InMemoryConfirmationStore } from '@lemonade/core';

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
 *
 * LM-20: the same gate also runs the pre-action hook on output. System 0 and
 * System 1 stay on input; `checkStep` is the policy layer on output — every
 * instruction to touch the vehicle passes it before it is spoken.
 */
export class DiagnosisSafetyGate implements PreActionHook {
    constructor(
        private readonly reactiveSafety: IReactiveSafetyService,
        private readonly safetyMonitor: ISafetyMonitor,
        private readonly logger: ILogger,
        /**
         * The live session's confirmation record. Defaults to an empty
         * in-memory store, so a gate built without one never finds a
         * confirmation: a risky step stays held. The live agent shares one
         * store between this gate and the confirmation tool.
         */
        private readonly confirmations: ConfirmationStore = new InMemoryConfirmationStore(),
    ) {}

    /**
     * The pre-action hook (LM-20): deny, ask, or allow one physical step.
     * A background job is denied outright. A risky step asks for the tech's
     * spoken confirmation, bound to the step id and VIN; a matching logged
     * confirmation turns the ask into an allow. A denied step is logged and
     * never spoken.
     */
    async checkStep(step: PhysicalStep, origin: StepOrigin): Promise<PreActionDecision> {
        const decision = await authorizeStep(step, origin, this.confirmations);
        if (decision.verdict === 'deny') {
            this.logger.warn('[MechanicReasoning] Pre-action hook denied a step', {
                stepId: step.stepId,
                reason: decision.reason,
            });
        }
        return decision;
    }

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
