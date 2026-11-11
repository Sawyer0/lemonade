import { describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { ErrorCode } from '@lemonade/core';
import type {
    ISessionRepository,
    IVehicleRepository,
    ICaseRepository,
    ILogger,
    DiagnosticSession,
    Vehicle,
    Case,
} from '@lemonade/core';
import { SessionService } from '../SessionService';

// LM-01: starting a session with a case validates the case and records the
// link in the case ledger. Sessions without a case never touch Postgres.
const silentLogger: ILogger = {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
};

function buildService() {
    const vehicleId = uuidv4();
    const userId = 'user-1';
    const sessionRepo = {
        create: vi.fn<[DiagnosticSession], Promise<void>>(),
    };
    const vehicleRepo = {
        findById: vi.fn<[string, string], Promise<Vehicle | null>>(),
    };
    const caseRepo = {
        findCaseById: vi.fn<[string], Promise<Case | null>>(),
        attachSession: vi.fn<[string, string], Promise<void>>(),
    };
    vehicleRepo.findById.mockResolvedValue({ id: vehicleId, userId } as Vehicle);
    const service = new SessionService(
        sessionRepo as unknown as ISessionRepository,
        vehicleRepo as unknown as IVehicleRepository,
        silentLogger,
        caseRepo as unknown as ICaseRepository,
    );
    return { service, vehicleId, userId, sessionRepo, vehicleRepo, caseRepo };
}

describe('SessionService startSession with a case', () => {
    it('starts a session without a case and never touches the case repo', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();

        const sessionId = await service.startSession(vehicleId, userId);

        expect(sessionId).toBeTruthy();
        expect(sessionRepo.create).toHaveBeenCalledOnce();
        expect(sessionRepo.create.mock.calls[0][0].caseId).toBeUndefined();
        expect(caseRepo.findCaseById).not.toHaveBeenCalled();
        expect(caseRepo.attachSession).not.toHaveBeenCalled();
    });

    it('attaches a session to an existing case', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();
        const caseId = uuidv4();
        caseRepo.findCaseById.mockResolvedValue({
            id: caseId,
            vehicleId,
            userId,
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const sessionId = await service.startSession(vehicleId, userId, caseId);

        expect(caseRepo.findCaseById).toHaveBeenCalledWith(caseId);
        expect(sessionRepo.create.mock.calls[0][0].caseId).toBe(caseId);
        expect(caseRepo.attachSession).toHaveBeenCalledWith(caseId, sessionId);
    });

    it('rejects a malformed caseId with 400 and creates nothing', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();

        await expect(service.startSession(vehicleId, userId, 'not-a-uuid')).rejects.toMatchObject({
            code: ErrorCode.INVALID_INPUT,
            statusCode: 400,
        });
        expect(sessionRepo.create).not.toHaveBeenCalled();
        expect(caseRepo.findCaseById).not.toHaveBeenCalled();
    });

    it('rejects an unknown case with 404 and creates nothing', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();
        caseRepo.findCaseById.mockResolvedValue(null);

        await expect(service.startSession(vehicleId, userId, uuidv4())).rejects.toMatchObject({
            code: ErrorCode.RESOURCE_NOT_FOUND,
            statusCode: 404,
        });
        expect(sessionRepo.create).not.toHaveBeenCalled();
        expect(caseRepo.attachSession).not.toHaveBeenCalled();
    });
});
