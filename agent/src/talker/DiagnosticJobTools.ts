import { llm } from '@livekit/agents';
import { z } from 'zod';
import type {
    CreateDiagnosticJobRequest,
    DiagnosticJobDetail,
    SubmitDiagnosticJobResponse,
} from '@lemonade/core';
import type { SessionContext } from '../diagnosis/sessionContext';
import type { ResultInjector } from './ResultInjector';

/** The job-service calls the talker tools need. */
export interface DiagnosticJobGateway {
    submitJob(request: CreateDiagnosticJobRequest): Promise<SubmitDiagnosticJobResponse>;
    getJob(jobId: string): Promise<DiagnosticJobDetail>;
    cancelJob(jobId: string): Promise<void>;
}

/**
 * Talker tools for the talker/reasoner split (LM-14). Gemini Live is the
 * talker; the diagnostic backend is the reasoner.
 *
 * `consult_diagnostician` files a job and returns its id fast (the client
 * bounds the submit), so the talker keeps the tech working instead of
 * waiting on slow reasoning. The result arrives later through the
 * ResultInjector. The tools never throw: a failed submit, status check, or
 * cancel is reported to the model as text, so the talker keeps going
 * without guessing a diagnosis.
 */
export function createDiagnosticJobTools(
    jobs: DiagnosticJobGateway,
    injector: ResultInjector,
    session: SessionContext,
) {
    return {
        consult_diagnostician: llm.tool({
            description:
                'Ask the diagnostician a hard question (a diagnosis, a spec value, a recall status, or a hazardous procedure). Returns a job id immediately; the answer arrives later, so keep helping the tech meanwhile and never state the diagnosis, procedure, spec, or recall status until the result arrives.',
            parameters: z.object({
                question: z.string().describe('The hard question for the diagnostician, e.g. "Is this squeal the brake pads or the wheel bearing?"'),
                evidence_refs: z
                    .array(z.string())
                    .describe('Evidence the diagnostician should use, e.g. DTC codes, what the tech saw, or measurements already taken'),
            }),
            execute: async ({ question, evidence_refs }) => {
                try {
                    const { jobId } = await jobs.submitJob({
                        question,
                        evidenceRefs: evidence_refs,
                        caseId: session.caseId,
                        sessionId: session.sessionId,
                        userId: session.userId,
                        vehicle: session.vehicle,
                    });
                    injector.track(jobId);
                    return (
                        `Diagnostic job ${jobId} accepted. The diagnostician is working on it. ` +
                        'Keep helping the tech meanwhile. Do not state a diagnosis, a hazardous procedure, ' +
                        'a spec value, or a recall status until the result arrives.'
                    );
                } catch (error) {
                    const reason = error instanceof Error ? error.message : 'unknown error';
                    return (
                        `The diagnostician is unavailable right now (${reason}). Keep helping the tech without it. ` +
                        'Do not guess a diagnosis, a hazardous procedure, a spec value, or a recall status.'
                    );
                }
            },
        }),
        job_status: llm.tool({
            description: 'Check what a diagnostic job has found so far. Use it when the tech asks whether the answer is ready yet.',
            parameters: z.object({
                job_id: z.string().describe('The job id returned by consult_diagnostician'),
            }),
            execute: async ({ job_id }) => {
                try {
                    const detail = await jobs.getJob(job_id);
                    const latest = detail.events[detail.events.length - 1];
                    return latest
                        ? `Job ${job_id} is ${detail.job.status}. Latest update: ${latest.text}`
                        : `Job ${job_id} is ${detail.job.status}. No updates yet.`;
                } catch (error) {
                    const reason = error instanceof Error ? error.message : 'unknown error';
                    return `I could not check job ${job_id} (${reason}). Keep helping the tech meanwhile.`;
                }
            },
        }),
        cancel_job: llm.tool({
            description: 'Cancel a diagnostic job that is no longer needed, e.g. the tech moved on to a different problem.',
            parameters: z.object({
                job_id: z.string().describe('The job id returned by consult_diagnostician'),
            }),
            execute: async ({ job_id }) => {
                try {
                    await jobs.cancelJob(job_id);
                    return `Diagnostic job ${job_id} cancelled.`;
                } catch (error) {
                    const reason = error instanceof Error ? error.message : 'unknown error';
                    return `I could not cancel job ${job_id} (${reason}). It will finish on its own; ignore its result if it arrives.`;
                }
            },
        }),
    };
}
