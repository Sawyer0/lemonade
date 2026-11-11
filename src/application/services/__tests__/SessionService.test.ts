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
    ObdScanResult,
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
        findById: vi.fn<[string], Promise<DiagnosticSession | null>>(),
        addObdCodes: vi.fn<[string, string[]], Promise<void>>(),
    };
    const vehicleRepo = {
        findById: vi.fn<[string, string], Promise<Vehicle | null>>(),
    };
    const caseRepo = {
        findCaseById: vi.fn<[string], Promise<Case | null>>(),
        attachSession: vi.fn<[string, string], Promise<void>>(),
        appendEntry: vi.fn<[string, unknown], Promise<unknown>>(),
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

    it('rejects a case owned by another user with 403 and creates nothing', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();
        caseRepo.findCaseById.mockResolvedValue({
            id: uuidv4(),
            vehicleId,
            userId: 'someone-else',
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(service.startSession(vehicleId, userId, uuidv4())).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(sessionRepo.create).not.toHaveBeenCalled();
        expect(caseRepo.attachSession).not.toHaveBeenCalled();
    });

    it('rejects a case for a different vehicle with 403 and creates nothing', async () => {
        const { service, vehicleId, userId, sessionRepo, caseRepo } = buildService();
        caseRepo.findCaseById.mockResolvedValue({
            id: uuidv4(),
            vehicleId: uuidv4(),
            userId,
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await expect(service.startSession(vehicleId, userId, uuidv4())).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(sessionRepo.create).not.toHaveBeenCalled();
        expect(caseRepo.attachSession).not.toHaveBeenCalled();
    });
});

describe('SessionService addDtcCodes', () => {
    function buildSessionService(session: DiagnosticSession) {
        const { service, sessionRepo, caseRepo } = buildService();
        sessionRepo.findById.mockResolvedValue(session);
        return { service, sessionRepo, caseRepo };
    }

    function buildSession(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
        return {
            id: uuidv4(),
            vehicleId: uuidv4(),
            userId: 'user-1',
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
            ...overrides,
        };
    }

    it('parses raw codes, stores canonical codes, and writes a dtc_read ledger entry', async () => {
        const caseId = uuidv4();
        const session = buildSession({ caseId });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        const parsed = await service.addDtcCodes(session.id, 'user-1', ['p0300', 'P 0420']);

        expect(parsed.map((code) => code.code)).toEqual(['P0300', 'P0420']);
        expect(parsed[0].description).toBe('Random/multiple cylinder misfire detected');
        expect(sessionRepo.addObdCodes).toHaveBeenCalledWith(session.id, ['P0300', 'P0420']);
        expect(caseRepo.appendEntry).toHaveBeenCalledWith(
            caseId,
            expect.objectContaining({
                type: 'dtc_read',
                source: 'OBD',
                payload: { codes: ['P0300', 'P0420'] },
            }),
        );
    });

    it('stores codes on the session without touching the ledger when there is no case', async () => {
        const session = buildSession();
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        const parsed = await service.addDtcCodes(session.id, 'user-1', ['U0100']);

        expect(parsed.map((code) => code.code)).toEqual(['U0100']);
        expect(sessionRepo.addObdCodes).toHaveBeenCalledWith(session.id, ['U0100']);
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });

    it('rejects the whole batch on one invalid code and writes nothing', async () => {
        const caseId = uuidv4();
        const session = buildSession({ caseId });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        await expect(service.addDtcCodes(session.id, 'user-1', ['P0300', 'X9999'])).rejects.toMatchObject({
            code: ErrorCode.INVALID_INPUT,
            statusCode: 400,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });

    it('rejects an empty batch with 400', async () => {
        const session = buildSession();
        const { service, sessionRepo } = buildSessionService(session);

        await expect(service.addDtcCodes(session.id, 'user-1', [])).rejects.toMatchObject({
            code: ErrorCode.INVALID_INPUT,
            statusCode: 400,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
    });

    it('rejects an unknown session with 404', async () => {
        const { service, sessionRepo } = buildService();
        sessionRepo.findById.mockResolvedValue(null);

        await expect(service.addDtcCodes(uuidv4(), 'user-1', ['P0300'])).rejects.toMatchObject({
            code: ErrorCode.RESOURCE_NOT_FOUND,
            statusCode: 404,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
    });

    it('rejects a session owned by another user with 403', async () => {
        const session = buildSession({ userId: 'someone-else' });
        const { service, sessionRepo } = buildSessionService(session);

        await expect(service.addDtcCodes(session.id, 'user-1', ['P0300'])).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
    });
});

describe('SessionService recordObdScan', () => {
    function buildSessionService(session: DiagnosticSession) {
        const { service, sessionRepo, caseRepo } = buildService();
        sessionRepo.findById.mockResolvedValue(session);
        return { service, sessionRepo, caseRepo };
    }

    function buildSession(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
        return {
            id: uuidv4(),
            vehicleId: uuidv4(),
            userId: 'user-1',
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
            ...overrides,
        };
    }

    function buildScan(overrides: Partial<ObdScanResult> = {}): ObdScanResult {
        return {
            adapter: { name: 'OBDLink CX', transport: 'ble', model: 'OBDLink CX' },
            capturedAt: '2026-11-11T15:00:00.000Z',
            storedCodes: ['P0300', 'P0420'],
            pendingCodes: ['P0300'],
            permanentCodes: [],
            freezeFrame: {
                dtc: 'P0300',
                readings: [{ pid: '0C', label: 'Engine RPM', value: 2500, unit: 'rpm', capturedAt: '2026-11-11T15:00:00.000Z' }],
            },
            mode06: [{ testId: '01', componentId: '01', value: 10, min: 0, max: 128, unit: 'count', passed: true }],
            readiness: {
                milOn: true,
                storedCodeCount: 2,
                monitors: [{ name: 'Catalyst', supported: true, complete: true }],
            },
            vin: '1HGCM82633A004352',
            calibrationIds: ['P0123456'],
            calibrationVerificationNumbers: ['12345678'],
            liveReadings: [],
            ...overrides,
        };
    }

    it('writes one obd_scan ledger entry and appends stored codes to the session', async () => {
        const caseId = uuidv4();
        const session = buildSession({ caseId });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);
        const scan = buildScan();

        const recorded = await service.recordObdScan(session.id, 'user-1', scan);

        expect(recorded).toEqual(scan);
        expect(caseRepo.appendEntry).toHaveBeenCalledWith(
            caseId,
            expect.objectContaining({
                type: 'obd_scan',
                source: 'OBD',
                actor: { kind: 'user', id: 'user-1' },
                occurredAt: new Date('2026-11-11T15:00:00.000Z'),
                payload: scan,
            }),
        );
        expect(sessionRepo.addObdCodes).toHaveBeenCalledWith(session.id, ['P0300', 'P0420']);
    });

    it('records stored codes on the session without touching the ledger when there is no case', async () => {
        const session = buildSession();
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        await service.recordObdScan(session.id, 'user-1', buildScan());

        expect(sessionRepo.addObdCodes).toHaveBeenCalledWith(session.id, ['P0300', 'P0420']);
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });

    it('skips the session write when the scan has no stored codes', async () => {
        const session = buildSession({ caseId: uuidv4() });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        await service.recordObdScan(session.id, 'user-1', buildScan({ storedCodes: [] }));

        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
        expect(caseRepo.appendEntry).toHaveBeenCalledOnce();
    });

    it('rejects a malformed scan and writes nothing', async () => {
        const session = buildSession({ caseId: uuidv4() });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);
        const badScan = { ...buildScan(), vin: 'too-short' } as unknown as ObdScanResult;

        await expect(service.recordObdScan(session.id, 'user-1', badScan)).rejects.toMatchObject({
            code: ErrorCode.INVALID_INPUT,
            statusCode: 400,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });

    it('rejects a session owned by another user with 403', async () => {
        const session = buildSession({ userId: 'someone-else' });
        const { service, sessionRepo, caseRepo } = buildSessionService(session);

        await expect(service.recordObdScan(session.id, 'user-1', buildScan())).rejects.toMatchObject({
            code: ErrorCode.FORBIDDEN,
            statusCode: 403,
        });
        expect(sessionRepo.addObdCodes).not.toHaveBeenCalled();
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });
});

describe('SessionService recordObdLedgerEvent', () => {
    it('appends a guided-test outcome to the case ledger', async () => {
        const caseId = uuidv4();
        const { service, sessionRepo, caseRepo } = buildService();
        const session: DiagnosticSession = {
            id: uuidv4(),
            vehicleId: uuidv4(),
            userId: 'user-1',
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
            caseId,
        };
        sessionRepo.findById.mockResolvedValue(session);

        await service.recordObdLedgerEvent(session.id, 'user-1', {
            type: 'guided_test',
            payload: {
                definitionId: 'hold-2500-rpm',
                definitionName: 'Hold 2,500 RPM',
                result: 'pass',
                checks: [
                    {
                        pid: '0C',
                        label: 'Engine RPM',
                        unit: 'rpm',
                        observedMin: 2450,
                        observedMax: 2550,
                        expectedMin: 2400,
                        expectedMax: 2600,
                        passed: true,
                    },
                ],
                samplesRecorded: 30,
                startedAt: '2026-11-11T15:00:00.000Z',
                endedAt: '2026-11-11T15:00:30.000Z',
            },
        });

        expect(caseRepo.appendEntry).toHaveBeenCalledWith(
            caseId,
            expect.objectContaining({ type: 'guided_test', source: 'OBD' }),
        );
    });

    it('refuses an OBD event for a session without a case', async () => {
        const { service, sessionRepo, caseRepo } = buildService();
        const session: DiagnosticSession = {
            id: uuidv4(),
            vehicleId: uuidv4(),
            userId: 'user-1',
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false,
            cumulativeVideoDurationProcessedMinutes: 0,
            cumulativeAudioDurationProcessedMinutes: 0,
        };
        sessionRepo.findById.mockResolvedValue(session);

        await expect(
            service.recordObdLedgerEvent(session.id, 'user-1', {
                type: 'verify_fix',
                payload: {
                    clearedAt: '2026-11-11T15:00:00.000Z',
                    rescannedAt: '2026-11-11T15:30:00.000Z',
                    driveCycleCompleted: true,
                    monitorsReady: true,
                    monitorsNotReady: [],
                    returnedStoredCodes: [],
                    returnedPendingCodes: [],
                    returnedPermanentCodes: [],
                    passed: true,
                },
            }),
        ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT, statusCode: 400 });
        expect(caseRepo.appendEntry).not.toHaveBeenCalled();
    });
});
