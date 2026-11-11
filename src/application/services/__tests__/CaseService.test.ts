import { describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode } from '@lemonade/core';
import type { ICaseRepository, ILogger, Case, LedgerEntry, OutcomePayload } from '@lemonade/core';
import { CaseService } from '../CaseService';

// LM-05: closing a case records the repair outcome and flips the case to
// closed. Only the owner may close it; a closed case stays closed.
const silentLogger: ILogger = {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
};

const confirmedOutcome: OutcomePayload = {
    repairPerformed: 'Replaced radiator hose',
    partsReplaced: ['Radiator hose'],
    codesCleared: true,
    symptomGone: true,
    retestPassed: true,
    confirmed: true,
};

function buildService() {
    const caseId = uuidv4();
    const userId = 'user-1';
    const openCase: Case = {
        id: caseId,
        vehicleId: 'vehicle-1',
        userId,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    const outcomeEntry = {
        id: uuidv4(),
        caseId,
        sequence: 1,
        type: 'outcome',
        actor: { kind: 'user', id: userId },
        source: 'tech',
        occurredAt: new Date(),
        payload: confirmedOutcome,
        previousHash: 'a'.repeat(64),
        entryHash: 'b'.repeat(64),
        createdAt: new Date(),
    } as LedgerEntry;
    const caseRepo = {
        findCaseById: vi.fn<[string], Promise<Case | null>>(),
        listEntries: vi.fn<[string], Promise<LedgerEntry[]>>(),
        closeCase: vi.fn<
            [string, Parameters<ICaseRepository['closeCase']>[1]],
            Promise<{ closedCase: Case; outcomeEntry: LedgerEntry }>
        >(),
    };
    caseRepo.findCaseById.mockResolvedValue(openCase);
    caseRepo.listEntries.mockResolvedValue([]);
    caseRepo.closeCase.mockResolvedValue({
        closedCase: { ...openCase, status: 'closed' },
        outcomeEntry,
    });
    const service = new CaseService(caseRepo as unknown as ICaseRepository, silentLogger);
    return { service, caseId, userId, openCase, outcomeEntry, caseRepo };
}

describe('CaseService closeCase', () => {
    it('closes an open case with the outcome entry', async () => {
        const { service, caseId, userId, outcomeEntry, caseRepo } = buildService();

        const result = await service.closeCase(caseId, userId, confirmedOutcome);

        expect(result.closedCase.status).toBe('closed');
        expect(result.outcomeEntry).toBe(outcomeEntry);
        expect(caseRepo.closeCase).toHaveBeenCalledOnce();
        const [closedId, appendInput] = caseRepo.closeCase.mock.calls[0];
        expect(closedId).toBe(caseId);
        expect(appendInput.type).toBe('outcome');
        expect(appendInput.payload).toEqual(confirmedOutcome);
        expect(appendInput.actor).toEqual({ kind: 'user', id: userId });
        expect(appendInput.source).toBe('tech');
    });

    it('closes a case with an unconfirmed outcome', async () => {
        const { service, caseId, userId, caseRepo } = buildService();
        const unconfirmed: OutcomePayload = {
            repairPerformed: 'Tightened hose clamp',
            partsReplaced: [],
            codesCleared: false,
            symptomGone: false,
            retestPassed: false,
            confirmed: false,
        };

        const result = await service.closeCase(caseId, userId, unconfirmed);

        expect(result.closedCase.status).toBe('closed');
        expect(caseRepo.closeCase.mock.calls[0][1].payload).toEqual(unconfirmed);
    });

    it('rejects a confirmed outcome when a check failed and closes nothing', async () => {
        const { service, caseId, userId, caseRepo } = buildService();

        await expect(
            service.closeCase(caseId, userId, { ...confirmedOutcome, retestPassed: false }),
        ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR, statusCode: 400 });
        expect(caseRepo.closeCase).not.toHaveBeenCalled();
    });

    it('rejects an unknown case with 404 and closes nothing', async () => {
        const { service, userId, caseRepo } = buildService();
        caseRepo.findCaseById.mockResolvedValue(null);

        await expect(service.closeCase(uuidv4(), userId, confirmedOutcome)).rejects.toMatchObject({
            code: ErrorCode.RESOURCE_NOT_FOUND,
            statusCode: 404,
        });
        expect(caseRepo.closeCase).not.toHaveBeenCalled();
    });

    it("rejects another tech's case with 403 and closes nothing", async () => {
        const { service, caseId, caseRepo, openCase } = buildService();
        caseRepo.findCaseById.mockResolvedValue({ ...openCase, userId: 'user-2' });

        await expect(service.closeCase(caseId, 'user-1', confirmedOutcome)).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(caseRepo.closeCase).not.toHaveBeenCalled();
    });

    it('rejects an already-closed case with 409 and closes nothing', async () => {
        const { service, caseId, userId, caseRepo, openCase } = buildService();
        caseRepo.findCaseById.mockResolvedValue({ ...openCase, status: 'closed' });

        await expect(service.closeCase(caseId, userId, confirmedOutcome)).rejects.toMatchObject({
            code: ErrorCode.RESOURCE_ALREADY_EXISTS,
            statusCode: 409,
        });
        expect(caseRepo.closeCase).not.toHaveBeenCalled();
    });

    it('rejects a malformed caseId with 400', async () => {
        const { service, userId, caseRepo } = buildService();

        await expect(service.closeCase('not-a-uuid', userId, confirmedOutcome)).rejects.toMatchObject({
            code: ErrorCode.INVALID_INPUT,
            statusCode: 400,
        });
        expect(caseRepo.findCaseById).not.toHaveBeenCalled();
    });
});

describe('CaseService getCase', () => {
    it('returns the case with its entries', async () => {
        const { service, caseId, userId, openCase, outcomeEntry, caseRepo } = buildService();
        caseRepo.listEntries.mockResolvedValue([outcomeEntry]);

        const result = await service.getCase(caseId, userId);

        expect(result.caseRecord).toBe(openCase);
        expect(result.entries).toEqual([outcomeEntry]);
    });

    it("rejects another tech's case with 403", async () => {
        const { service, caseId, caseRepo, openCase } = buildService();
        caseRepo.findCaseById.mockResolvedValue({ ...openCase, userId: 'user-2' });

        await expect(service.getCase(caseId, 'user-1')).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(caseRepo.listEntries).not.toHaveBeenCalled();
    });
});
