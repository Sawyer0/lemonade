import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type {
    ICaseRepository,
    ICaseService,
    ILogger,
    OutcomePayload,
    CaseWithEntries,
    CloseCaseResult,
} from '@lemonade/core';
import { AppError, ErrorCode, OutcomePayloadSchema } from '@lemonade/core';
import { z } from 'zod';

@injectable()
export class CaseService implements ICaseService {
    constructor(
        @inject(TYPES.CaseRepo) private caseRepo: ICaseRepository,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    async getCase(caseId: string, userId: string): Promise<CaseWithEntries> {
        const resolvedCase = await this.loadOwnedCase(caseId, userId);
        const entries = await this.caseRepo.listEntries(caseId);
        return { caseRecord: resolvedCase, entries };
    }

    async closeCase(caseId: string, userId: string, outcome: OutcomePayload): Promise<CloseCaseResult> {
        const parsedOutcome = this.parseOutcome(outcome);
        const resolvedCase = await this.loadOwnedCase(caseId, userId);
        if (resolvedCase.status === 'closed') {
            throw new AppError(ErrorCode.RESOURCE_ALREADY_EXISTS, `Case is already closed: ${caseId}`);
        }
        const result = await this.caseRepo.closeCase(caseId, {
            type: 'outcome',
            actor: { kind: 'user', id: userId },
            source: 'tech',
            occurredAt: new Date(),
            payload: parsedOutcome,
        });
        this.logger.info('[CaseService] Case closed', {
            caseId,
            userId,
            confirmed: parsedOutcome.confirmed,
            outcomeEntryId: result.outcomeEntry.id,
        });
        return result;
    }

    /**
     * Loads the case and proves the caller owns it. A malformed id is a
     * client error (400), an unknown case is a 404, and another tech's case
     * is a 403 — the ledger must never leak across owners.
     */
    private async loadOwnedCase(caseId: string, userId: string) {
        if (!z.string().uuid().safeParse(caseId).success) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'caseId must be a valid UUID');
        }
        const resolvedCase = await this.caseRepo.findCaseById(caseId);
        if (!resolvedCase) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
        }
        if (resolvedCase.userId !== userId) {
            this.logger.warn('[CaseService] close forbidden', { caseId, userId, ownerId: resolvedCase.userId });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not own this case', 403);
        }
        return resolvedCase;
    }

    private parseOutcome(outcome: OutcomePayload): OutcomePayload {
        try {
            return OutcomePayloadSchema.parse(outcome);
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new AppError(
                    ErrorCode.VALIDATION_ERROR,
                    `Invalid outcome: ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`,
                );
            }
            throw error;
        }
    }
}
