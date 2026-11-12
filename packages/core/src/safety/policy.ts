import { z } from 'zod';
import { SafetyClassSchema } from '../diagnosis/tests/testSchema';
import { HazardTypeSchema, type HazardType } from '../types/safety';

// --- Pre-action safety policy (LM-20) ---
// System 0 (reactive) and System 1 (semantic) gate what goes INTO the
// reasoner. This module gates what comes OUT: every instruction to touch
// the vehicle passes a pre-action hook (deny, ask, allow) with a risk level
// per step. Risky steps require the tech's spoken confirmation, bound to
// that exact step id and VIN and logged in the case ledger. Background jobs
// can never issue a step: there is no tech present to confirm it.

export const RiskLevelSchema = z.enum(['low', 'elevated', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const StepOriginSchema = z.enum(['live-session', 'background-job']);
export type StepOrigin = z.infer<typeof StepOriginSchema>;

export const PreActionVerdictSchema = z.enum(['allow', 'ask', 'deny']);
export type PreActionVerdict = z.infer<typeof PreActionVerdictSchema>;

/** A scripted physical step: one step of a test-library script (LM-34). */
export const PhysicalStepSchema = z
    .object({
        /** Stable id of the step, e.g. `coil-test-p0300:step-2` (see stepIdFor). */
        stepId: z.string().min(1),
        /** Test the step belongs to, when it comes from the test library. */
        testId: z.string().min(1).optional(),
        /** The spoken instruction, e.g. "disconnect the orange HV cables". */
        instruction: z.string().min(1),
        safetyClass: SafetyClassSchema,
        hazards: z.array(HazardTypeSchema),
        /** VIN the step is performed on. Absent when the vehicle is unknown. */
        vin: z.string().min(1).optional(),
    })
    .strict();
export type PhysicalStep = z.infer<typeof PhysicalStepSchema>;

/** The four risky categories from LM-20, each naming its hazards. */
export const RiskCategorySchema = z.enum(['hv-system', 'fuel', 'lifting', 'running-engine']);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

const RISK_CATEGORY_HAZARDS: Record<RiskCategory, HazardType[]> = {
    'hv-system': ['HIGH_VOLTAGE', 'ELECTRICAL_SHORT', 'BATTERY_ACID'],
    fuel: ['FUEL_LEAK', 'FIRE_RISK'],
    lifting: ['SUSPENDED_LOAD', 'UNSTABLE_VEHICLE', 'JACK_STAND_MISSING'],
    'running-engine': ['ROTATING_PARTS', 'CARBON_MONOXIDE', 'EXHAUST_FUMES'],
};

const RISK_CATEGORY_COPY: Record<RiskCategory, string> = {
    'hv-system': 'high-voltage system work',
    fuel: 'fuel system work',
    lifting: 'lifting the vehicle',
    'running-engine': 'running-engine work',
};

/** The risky category a hazard belongs to, if any. */
export function riskCategoryForHazard(hazard: HazardType): RiskCategory | undefined {
    for (const category of Object.keys(RISK_CATEGORY_HAZARDS) as RiskCategory[]) {
        if (RISK_CATEGORY_HAZARDS[category].includes(hazard)) return category;
    }
    return undefined;
}

export interface PreActionDecision {
    verdict: PreActionVerdict;
    riskLevel: RiskLevel;
    /** Human-readable reason, spoken or logged with the decision. */
    reason: string;
    /** True when the step may only be spoken after a logged confirmation. */
    requiresConfirmation: boolean;
}

/**
 * Pure policy evaluation. No store, no ledger, no I/O: the same step and
 * origin always give the same decision.
 *
 * - A background job is denied outright: no tech is present to confirm.
 * - A failed safety check is denied outright: fail closed.
 * - A hazardous step, or one touching a risky category, asks at high risk.
 * - A caution step asks at elevated risk.
 * - Anything else is allowed at low risk.
 * - An ask without a 17-character VIN is denied instead: a spoken
 *   confirmation cannot be bound to the vehicle without one.
 */
export function evaluatePreActionStep(step: PhysicalStep, origin: StepOrigin): PreActionDecision {
    if (origin === 'background-job') {
        return {
            verdict: 'deny',
            riskLevel: 'high',
            reason: 'Background jobs can never issue a physical step: no technician is present to confirm it.',
            requiresConfirmation: false,
        };
    }
    if (step.hazards.includes('SAFETY_CHECK_FAILED')) {
        return {
            verdict: 'deny',
            riskLevel: 'high',
            reason: 'The safety check failed, so this step is denied.',
            requiresConfirmation: false,
        };
    }
    const category = step.hazards
        .map((hazard) => riskCategoryForHazard(hazard))
        .find((found): found is RiskCategory => found !== undefined);
    if (step.safetyClass === 'hazardous' || category !== undefined) {
        const reason =
            category !== undefined
                ? `This step is ${RISK_CATEGORY_COPY[category]} and requires the technician's spoken confirmation.`
                : "This step is hazardous and requires the technician's spoken confirmation.";
        if (!step.vin || step.vin.length !== 17) {
            return {
                verdict: 'deny',
                riskLevel: 'high',
                reason: `${reason} It is denied because there is no 17-character VIN to bind the confirmation to.`,
                requiresConfirmation: false,
            };
        }
        return { verdict: 'ask', riskLevel: 'high', reason, requiresConfirmation: true };
    }
    if (step.safetyClass === 'caution') {
        if (!step.vin || step.vin.length !== 17) {
            return {
                verdict: 'deny',
                riskLevel: 'high',
                reason: "This step needs caution and requires the technician's spoken confirmation. It is denied because there is no 17-character VIN to bind the confirmation to.",
                requiresConfirmation: false,
            };
        }
        return {
            verdict: 'ask',
            riskLevel: 'elevated',
            reason: "This step needs caution and requires the technician's spoken confirmation.",
            requiresConfirmation: true,
        };
    }
    return {
        verdict: 'allow',
        riskLevel: 'low',
        reason: 'This is a routine step.',
        requiresConfirmation: false,
    };
}

// --- Spoken confirmations ---
// A confirmation is bound to one exact step id and one VIN. It matches
// only that pair: a confirmation for another step, or another vehicle,
// never releases a step.

export const StepConfirmationSchema = z
    .object({
        stepId: z.string().min(1),
        vin: z.string().length(17),
        riskLevel: RiskLevelSchema,
        confirmedBy: z.literal('voice'),
        /** ISO timestamp of the tech's spoken confirmation. */
        confirmedAt: z.string().datetime(),
        /** What the tech said, when the transcript captured it. */
        confirmationText: z.string().min(1).optional(),
    })
    .strict();
export type StepConfirmation = z.infer<typeof StepConfirmationSchema>;

/** True only when the confirmation is for this exact step on this exact VIN. */
export function confirmationMatches(confirmation: StepConfirmation, stepId: string, vin: string): boolean {
    return confirmation.stepId === stepId && confirmation.vin === vin;
}

/** The confirmation record for a live session. The ledger is the durable record; this is the live lookup. */
export interface ConfirmationStore {
    record(confirmation: StepConfirmation): Promise<void>;
    find(stepId: string, vin: string): Promise<StepConfirmation | undefined>;
}

/** In-memory store for one live session. Confirmations die with the session, as they should: a new session re-confirms. */
export class InMemoryConfirmationStore implements ConfirmationStore {
    private readonly confirmations = new Map<string, StepConfirmation>();

    async record(confirmation: StepConfirmation): Promise<void> {
        this.confirmations.set(`${confirmation.stepId}::${confirmation.vin}`, confirmation);
    }

    async find(stepId: string, vin: string): Promise<StepConfirmation | undefined> {
        return this.confirmations.get(`${stepId}::${vin}`);
    }
}

/**
 * The pre-action hook's entry point: evaluate the policy, and when the
 * verdict is ask, look for a logged confirmation bound to this step and
 * VIN. A matching confirmation turns ask into allow; without one the step
 * stays held for the tech's spoken confirmation.
 */
export async function authorizeStep(
    step: PhysicalStep,
    origin: StepOrigin,
    confirmations: ConfirmationStore,
): Promise<PreActionDecision> {
    const decision = evaluatePreActionStep(step, origin);
    if (decision.verdict !== 'ask' || !step.vin) return decision;
    const confirmation = await confirmations.find(step.stepId, step.vin);
    if (!confirmation || !confirmationMatches(confirmation, step.stepId, step.vin)) return decision;
    return {
        verdict: 'allow',
        riskLevel: decision.riskLevel,
        reason: `Spoken confirmation on file for step ${step.stepId} on VIN ${step.vin}.`,
        requiresConfirmation: false,
    };
}

/** The port the talker-side hook implements: check one step, or deny it. */
export interface PreActionHook {
    checkStep(step: PhysicalStep, origin: StepOrigin): Promise<PreActionDecision>;
}

/** Stable step id for step `index` (0-based) of test `testId`. */
export function stepIdFor(testId: string, index: number): string {
    return `${testId}:step-${index + 1}`;
}

/**
 * The exact words spoken to request a confirmation. Deterministic, so tests
 * pin it: it names the risk, the instruction, and that the tech must say
 * "confirmed" — and must not start until then.
 */
export function buildConfirmationPrompt(step: PhysicalStep, decision: PreActionDecision): string {
    const risk = decision.riskLevel === 'high' ? 'high-risk' : 'caution';
    return (
        `Before you ${step.instruction}, this is a ${risk} step. ` +
        `Say "confirmed" only when you are ready, and do not start until then.`
    );
}
