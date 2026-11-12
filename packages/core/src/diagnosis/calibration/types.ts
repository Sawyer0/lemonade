// Calibration types (LM-37): the generated-config schema from
// docs/specs/LM-37-calibration.md, the resolved-case unit the fit runs
// on, and the calibrated result the stop rule reads.
import { z } from 'zod';

/** Subsystem groups the fit runs per; anything under 50 fit cases pools into `_pooled`. */
export const SubsystemGroupSchema = z.enum(['powertrain', 'electrical', 'brakes_steering', 'hvac', 'body', '_pooled']);
export type SubsystemGroup = z.infer<typeof SubsystemGroupSchema>;

export const CalibrationMethodSchema = z.enum(['isotonic', 'platt', 'identity']);
export type CalibrationMethod = z.infer<typeof CalibrationMethodSchema>;

const calibrationMapShape = {
    method: CalibrationMethodSchema,
    map: z
        .object({
            x: z.array(z.number().min(0).max(1)),
            y: z.array(z.number().min(0).max(1)),
        })
        .strict()
        .optional(),
    a: z.number().optional(),
    b: z.number().optional(),
};

type CalibrationMapShape = z.infer<z.ZodObject<typeof calibrationMapShape>>;

function checkMapRequirements(value: CalibrationMapShape, ctx: z.RefinementCtx): void {
    if (value.method === 'isotonic' && value.map === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'isotonic calibration needs map knots' });
    }
    if (value.method === 'platt' && (value.a === undefined || value.b === undefined)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'platt calibration needs a and b' });
    }
}

/** One calibration map: isotonic knots, Platt (a, b), or the identity pass-through. */
export const CalibrationMapSchema = z.object(calibrationMapShape).strict().superRefine(checkMapRequirements);
export type CalibrationMap = z.infer<typeof CalibrationMapSchema>;

/** A group's fitted map plus its fit/holdout counts and holdout metrics. */
export const GroupCalibrationSchema = z
    .object({
        ...calibrationMapShape,
        n_fit: z.number().int().min(0),
        n_holdout: z.number().int().min(0),
        metrics: z
            .object({
                ece: z.number().min(0),
                brier: z.number().min(0),
                top1: z.number().min(0).max(1),
            })
            .strict()
            .optional(),
    })
    .strict()
    .superRefine(checkMapRequirements);
export type GroupCalibration = z.infer<typeof GroupCalibrationSchema>;

/** The generated config: only the fit script writes it, never by hand. */
export const GeneratedCalibrationConfigSchema = z
    .object({
        version: z.literal(1),
        fitted_at: z.string().min(1),
        dataset_sha256: z.string().min(1),
        split: z.object({ holdout: z.string().min(1) }).strict(),
        groups: z.record(SubsystemGroupSchema, GroupCalibrationSchema),
        other_mass: CalibrationMapSchema,
        thresholds: z
            .object({
                tau_floor: z.number().min(0).max(1),
                eps_safety: z.number().min(0).max(1),
                other_escalate: z.number().min(0).max(1),
            })
            .strict(),
    })
    .strict();
export type GeneratedCalibrationConfig = z.infer<typeof GeneratedCalibrationConfigSchema>;

/**
 * One resolved case, scored at the moment of commit: the raw posterior
 * on the top hypothesis, the OTHER mass, the highest safety-critical
 * probability besides the leader, and whether the top hypothesis
 * matched the verified fix (1) or not (0). Cases without a verified
 * outcome are excluded before this point, so every record has a label.
 */
export const ResolvedCaseSchema = z
    .object({
        caseId: z.string().min(1),
        suiteId: z.string().min(1),
        group: SubsystemGroupSchema,
        committedHypothesisId: z.string().min(1),
        trueHypothesisId: z.string().min(1),
        trueCauseSafetyCritical: z.boolean(),
        /** Whether the true cause was among the hypotheses listed at commit. */
        trueCauseListed: z.boolean(),
        rawProbability: z.number().min(0).max(1),
        otherProbability: z.number().min(0).max(1),
        safetyProbability: z.number().min(0).max(1),
        label: z.union([z.literal(0), z.literal(1)]),
        closedAt: z.string().min(1),
    })
    .strict();
export type ResolvedCase = z.infer<typeof ResolvedCaseSchema>;

/** A calibrated probability plus whether it came from a real fit. */
export interface CalibratedProbability {
    calibrated: number;
    method: CalibrationMethod;
    /** True when the map is the identity: no fit backs this number. */
    uncalibrated: boolean;
    group: SubsystemGroup;
}

/** One fit point: a raw posterior and whether the top hypothesis was right. */
export interface FitPoint {
    x: number;
    label: 0 | 1;
}
