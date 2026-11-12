import { z } from 'zod';
import { LocalTriageResultSchema } from './localPerception';
import type { NeurosymbolicState } from './neurosymbolic';
import type { ReasoningInput } from './reasoning';
import { SafetyClassSchema } from '../diagnosis/tests/testSchema';
import { HazardTypeSchema } from './safety';
import type { PhysicalStep, StepOrigin } from '../safety/policy';

/**
 * Talker/reasoner job tickets (LM-14). Gemini Live is the talker; the
 * diagnostic backend is the reasoner. The talker files a job, keeps talking,
 * and the reasoner's events are delivered back: progress and case snapshots
 * as silent context, findings and "measure this" at the next idle gap, safety
 * stops as an interrupt. Jobs belong to the case, not the Gemini connection,
 * so they survive reconnects.
 *
 * Timestamps are ISO strings: jobs cross the HTTP/SSE boundary, so the wire
 * format carries strings, not Dates.
 */

/** How long the talker may wait for `consult_diagnostician` to return a job id. */
export const CONSULT_TOOL_BUDGET_MS = 300;
/** Client-side submit timeout, inside the tool budget with room to answer. */
export const JOB_SUBMIT_TIMEOUT_MS = 250;

export const DiagnosticJobStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']);
export type DiagnosticJobStatus = z.infer<typeof DiagnosticJobStatusSchema>;

export const DiagnosticJobEventKindSchema = z.enum([
    'progress',
    'snapshot',
    'finding',
    'measure',
    'safety_stop',
    'failed',
    'cancelled',
]);
export type DiagnosticJobEventKind = z.infer<typeof DiagnosticJobEventKindSchema>;

/** Event kinds after which a job emits nothing more. A job has exactly one terminal event. */
export const TERMINAL_JOB_EVENT_KINDS: ReadonlySet<DiagnosticJobEventKind> = new Set([
    'finding',
    'measure',
    'safety_stop',
    'failed',
    'cancelled',
]);

export const DiagnosticJobEventSchema = z.object({
    jobId: z.string().uuid(),
    /** Per-job sequence, starting at 1. The injector skips events at or below the acked seq. */
    seq: z.number().int().min(1),
    kind: DiagnosticJobEventKindSchema,
    /** Human-readable payload: what the talker should know, say, or do. */
    text: z.string().min(1),
    /**
     * LM-20: the scripted physical step behind a `measure` event, when the
     * reasoner issued one. The talker's pre-action hook gates on this: a
     * step without it is unstructured reasoner text, not a scripted step.
     * `origin` is stamped where the job was filed: only the live talker's
     * route files `live-session` jobs.
     */
    step: z
        .object({
            stepId: z.string().min(1),
            testId: z.string().min(1).optional(),
            instruction: z.string().min(1),
            safetyClass: SafetyClassSchema,
            hazards: z.array(HazardTypeSchema),
            vin: z.string().min(1).optional(),
            origin: z.enum(['live-session', 'background-job']),
        })
        .strict()
        .optional(),
    createdAt: z.string().datetime(),
});
export type DiagnosticJobEvent = z.infer<typeof DiagnosticJobEventSchema>;

/** A scripted step as carried on a job event: the policy's step plus its filing origin. */
export type JobStep = NonNullable<DiagnosticJobEvent['step']>;

/** The step the event carries, as the pre-action policy sees it. */
export function jobStepToPhysicalStep(step: JobStep): PhysicalStep {
    return {
        stepId: step.stepId,
        testId: step.testId,
        instruction: step.instruction,
        safetyClass: step.safetyClass,
        hazards: step.hazards,
        vin: step.vin,
    };
}

/** The origin the event's step was filed with: background unless stamped live. */
export function jobStepOrigin(step: JobStep | undefined): StepOrigin {
    return step?.origin ?? 'background-job';
}

export const DiagnosticJobSchema = z.object({
    id: z.string().uuid(),
    /** Case the job belongs to. Absent when the session has no case yet (LM-39). */
    caseId: z.string().uuid().optional(),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    question: z.string().min(1),
    evidenceRefs: z.array(z.string()),
    vehicleSummary: z.string().min(1),
    status: DiagnosticJobStatusSchema,
    /** Highest event seq the talker has confirmed delivering. Resume skips events at or below it. */
    ackedSeq: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
});
export type DiagnosticJob = z.infer<typeof DiagnosticJobSchema>;

/** What the talker (or a burst) files with the job service. */
export const CreateDiagnosticJobRequestSchema = z.object({
    question: z.string().min(1),
    evidenceRefs: z.array(z.string()).default([]),
    caseId: z.string().uuid().optional(),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    vehicle: z
        .object({
            year: z.number().int().optional(),
            make: z.string().optional(),
            model: z.string().optional(),
            engine: z.string().optional(),
            trim: z.string().optional(),
            vin: z.string().optional(),
        })
        .default({}),
    /** On-device triage from a visual burst, when the job came from one. */
    localTriage: LocalTriageResultSchema.optional(),
});
export type CreateDiagnosticJobRequest = z.infer<typeof CreateDiagnosticJobRequestSchema>;
/** What callers pass in: evidenceRefs, vehicle and localTriage are optional until defaults apply. */
export type CreateDiagnosticJobInput = z.input<typeof CreateDiagnosticJobRequestSchema>;

export const SubmitDiagnosticJobResponseSchema = z.object({
    jobId: z.string().uuid(),
    status: DiagnosticJobStatusSchema,
});
export type SubmitDiagnosticJobResponse = z.infer<typeof SubmitDiagnosticJobResponseSchema>;

/** GET /api/jobs/[jobId]: the job plus every event it has emitted so far. */
export const DiagnosticJobDetailSchema = z.object({
    job: DiagnosticJobSchema,
    events: z.array(DiagnosticJobEventSchema),
});
export type DiagnosticJobDetail = z.infer<typeof DiagnosticJobDetailSchema>;

export const AcknowledgeDiagnosticJobRequestSchema = z.object({
    seq: z.number().int().min(0),
});
export type AcknowledgeDiagnosticJobRequest = z.infer<typeof AcknowledgeDiagnosticJobRequestSchema>;

/** One reasoner outcome, before the store stamps job id, seq and timestamp. */
export interface DiagnosticJobEventDraft {
    kind: DiagnosticJobEventKind;
    text: string;
    /** LM-20: the scripted step behind a `measure` event, when there is one. */
    step?: JobStep;
}

/** Short human summary of what a job is about, sent as the snapshot event. */
export function diagnosticJobSnapshotText(job: Pick<DiagnosticJob, 'caseId' | 'question' | 'vehicleSummary'>): string {
    const scope = job.caseId ? `Case ${job.caseId}` : 'No case yet';
    return `${scope} · ${job.vehicleSummary} · Question: ${job.question}`;
}

/** Short human summary of a vehicle for a job, from the reasoner's vehicle context. */
export function vehicleSummaryText(vehicle: ReasoningInput['vehicleContext']): string {
    const name = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
    return name || 'unknown vehicle';
}

/**
 * Maps a finished reasoner run onto the job events the talker needs. A
 * STOP_DANGER verdict is a safety stop (interrupt); REQUEST_MORE_INFO is a
 * "measure this" step (speak at the next idle gap); anything else is a
 * finding. Manual safety alerts ride along with a finding, never silently.
 *
 * LM-20: `origin` is where the job was filed. A background job can never
 * issue a physical step — there is no technician present to confirm it —
 * so a background REQUEST_MORE_INFO becomes a finding that says the check
 * must be requested in a live session, never a `measure` event. The default
 * is background: a caller must explicitly claim a live session.
 */
export function diagnosisToJobEvents(
    state: NeurosymbolicState,
    origin: StepOrigin = 'background-job',
): DiagnosticJobEventDraft[] {
    const decision = state.finalDiagnosis.decision;
    const alerts = state.authorityData.safetyAlerts.filter(Boolean);
    if (decision === 'STOP_DANGER') {
        const text = alerts.length
            ? `${state.finalDiagnosis.userOutput}\nSafety notes: ${alerts.join('; ')}`
            : state.finalDiagnosis.userOutput;
        return [{ kind: 'safety_stop', text }];
    }
    if (decision === 'REQUEST_MORE_INFO') {
        if (origin === 'background-job') {
            const text = state.finalDiagnosis.userOutput;
            return [
                {
                    kind: 'finding',
                    text: `${text}\nThe next check needs a measurement, but a background job cannot issue a physical step. Ask for it in a live session.`,
                },
            ];
        }
        const actions = state.finalDiagnosis.requiredActions.filter(Boolean);
        const text = actions.length
            ? `${state.finalDiagnosis.userOutput}\nMeasure or check next: ${actions.join('; ')}`
            : state.finalDiagnosis.userOutput;
        return [{ kind: 'measure', text }];
    }
    const text = alerts.length
        ? `${state.finalDiagnosis.userOutput}\nSafety notes: ${alerts.join('; ')}`
        : state.finalDiagnosis.userOutput;
    return [{ kind: 'finding', text }];
}
