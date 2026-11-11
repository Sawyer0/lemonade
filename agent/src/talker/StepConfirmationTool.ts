import { llm } from '@livekit/agents';
import { z } from 'zod';
import type {
    ConfirmationStore,
    ICaseRepository,
    ILogger,
    PhysicalStep,
    StepConfirmation,
} from '@lemonade/core';
import type { SessionContext } from '../diagnosis/sessionContext';
import type { PendingStep } from './ResultInjector';

/** The held steps the tool releases: the injector owns them. */
export interface PendingStepSource {
    pendingStep(stepId: string): PendingStep | undefined;
    releasePendingStep(stepId: string): Promise<boolean>;
}

/** Durable record of a confirmation. The ledger is the proof it happened. */
export interface StepConfirmationRecorder {
    record(
        confirmation: StepConfirmation,
        step: PhysicalStep,
        context: { caseId: string; userId: string },
    ): Promise<void>;
}

/**
 * Records confirmations as `step_confirmation` ledger entries. The actor
 * is the technician: they spoke the confirmation. The repository resolves
 * lazily, like the transcript sink: a missing ledger fails the
 * confirmation, never the call — a confirmation that cannot be logged
 * never releases its step.
 */
export function createLedgerStepConfirmationRecorder(
    repository: () => ICaseRepository | undefined,
    logger: ILogger,
): StepConfirmationRecorder {
    return {
        async record(confirmation, step, context): Promise<void> {
            const repo = repository();
            if (!repo) throw new Error('case ledger unavailable');
            try {
                await repo.appendEntry(context.caseId, {
                    type: 'step_confirmation',
                    actor: { kind: 'user', id: context.userId },
                    source: 'tech',
                    occurredAt: new Date(),
                    payload: {
                        stepId: confirmation.stepId,
                        ...(step.testId ? { testId: step.testId } : {}),
                        vin: confirmation.vin,
                        instruction: step.instruction,
                        riskLevel: confirmation.riskLevel,
                        ...(confirmation.confirmationText
                            ? { confirmationText: confirmation.confirmationText }
                            : {}),
                    },
                });
            } catch (error) {
                logger.error('failed to record step confirmation in the ledger', error, {
                    caseId: context.caseId,
                    stepId: confirmation.stepId,
                });
                throw error;
            }
        },
    };
}

/**
 * Talker tool for the voice-confirmation loop (LM-20). The model calls it
 * when the technician confirms a held step out loud.
 *
 * The order is the invariant: ledger first, then the live store, then the
 * release. A step is spoken only after its confirmation is logged — a
 * confirmation that cannot be logged never releases its step, and a step
 * with no case (so nowhere to log) stays held.
 */
export function createStepConfirmationTools(
    pending: PendingStepSource,
    confirmations: ConfirmationStore,
    recorder: StepConfirmationRecorder | undefined,
    session: SessionContext,
    logger: ILogger,
) {
    return {
        confirm_physical_step: llm.tool({
            description:
                'Record the technician\'s spoken confirmation of a held physical step. Call it only when the technician says "confirmed" (or the equivalent) for a step the injector is holding for confirmation — the step id comes from the silent context. The confirmation is logged in the case ledger, then the held step is spoken.',
            parameters: z.object({
                step_id: z.string().describe('The id of the held step, e.g. "hv-isolation-test:step-2"'),
                confirmation_text: z
                    .string()
                    .optional()
                    .describe('What the technician said, when the transcript captured it'),
            }),
            execute: async ({ step_id, confirmation_text }) => {
                const held = pending.pendingStep(step_id);
                if (!held) {
                    return (
                        `No physical step ${step_id} is waiting for confirmation. ` +
                        'Do not perform any step that was not confirmed.'
                    );
                }
                const { step, decision } = held;
                if (!step.vin || step.vin.length !== 17) {
                    return (
                        `Step ${step_id} has no VIN to bind a confirmation to, so it cannot be confirmed. ` +
                        'It stays held. Do not start it.'
                    );
                }
                if (!session.caseId || !recorder) {
                    return (
                        `Step ${step_id} cannot be confirmed: there is no case ledger for this session, ` +
                        'so the confirmation cannot be logged. It stays held. Do not start it.'
                    );
                }
                const confirmation: StepConfirmation = {
                    stepId: step.stepId,
                    vin: step.vin,
                    riskLevel: decision.riskLevel,
                    confirmedBy: 'voice',
                    confirmedAt: new Date().toISOString(),
                    ...(confirmation_text ? { confirmationText: confirmation_text } : {}),
                };
                try {
                    await recorder.record(confirmation, step, {
                        caseId: session.caseId,
                        userId: session.userId,
                    });
                } catch {
                    return (
                        `The confirmation for step ${step_id} could not be logged, so the step stays held. ` +
                        'Do not start it.'
                    );
                }
                await confirmations.record(confirmation);
                const released = await pending.releasePendingStep(step_id);
                if (!released) {
                    logger.warn('Step confirmed and logged but not spoken yet', { stepId: step_id });
                    return (
                        `Step ${step_id} is confirmed and logged, but it could not be spoken yet. ` +
                        'It will be spoken at the next idle gap. Do not start it until then.'
                    );
                }
                return `Step ${step_id} is confirmed and logged. It is being spoken now.`;
            },
        }),
    };
}
