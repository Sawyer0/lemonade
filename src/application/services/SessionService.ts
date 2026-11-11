import { injectable, inject, LazyServiceIdentifier } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { ISessionRepository, IVehicleRepository, ILogger, ICaseRepository } from '@lemonade/core';
import {
    ISessionService,
    DiagnosticSession,
    Vehicle,
    AppError,
    ErrorCode,
    parseDtcBatch,
    ObdScanResultSchema,
    AppendLedgerEntryInputSchema,
} from '@lemonade/core';
import type { ObdLedgerEventInput, ObdScanResult, ParsedDtc } from '@lemonade/core';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

@injectable()
export class SessionService implements ISessionService {
    constructor(
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger,
        // Resolved lazily: sessions without a case must never touch Postgres,
        // and the case-ledger pool fails fast when its database URL is unset.
        @inject(new LazyServiceIdentifier(() => TYPES.CaseRepo)) private caseRepo: ICaseRepository,
    ) {}

    async startSession(vehicleId: string, userId: string, caseId?: string): Promise<string> {
        const vehicle = await this.vehicleRepo.findById(vehicleId, userId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Vehicle not found');

        if (vehicle.userId !== userId) {
            this.logger.warn(`[SessionService] Unauthorized session start attempt`, {
                vehicleId,
                userId,
                ownerId: vehicle.userId,
            });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not own this vehicle', 403);
        }

        // A case link is validated before the session is created: a malformed
        // id is a client error (400) and an unknown case is a 404. The case
        // repo is only resolved when a caseId is given.
        if (caseId) {
            if (!z.string().uuid().safeParse(caseId).success) {
                throw new AppError(ErrorCode.INVALID_INPUT, 'caseId must be a valid UUID');
            }
            const existingCase = await this.caseRepo.findCaseById(caseId);
            if (!existingCase) {
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
            }
            // The case must belong to this user and this vehicle: attaching
            // a session to someone else's case (or a case for another
            // vehicle) would leak its ledger to the wrong session.
            if (existingCase.userId !== userId || existingCase.vehicleId !== vehicleId) {
                this.logger.warn(`[SessionService] Session start for a case owned by another user or vehicle`, {
                    caseId,
                    vehicleId,
                    userId,
                    caseOwnerId: existingCase.userId,
                    caseVehicleId: existingCase.vehicleId,
                });
                throw new AppError(ErrorCode.FORBIDDEN, 'This case does not belong to you and this vehicle', 403);
            }
        }

        const newSession: DiagnosticSession = {
            id: uuidv4(),
            vehicleId: vehicle.id,
            userId: vehicle.userId,
            ...(caseId ? { caseId } : {}),
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

        await this.sessionRepo.create(newSession);

        // The case ledger is the source of truth for which sessions belong to
        // a case (what listSessions reads); the session's own caseId field is
        // set at creation. startSession is the single place the link is
        // recorded.
        if (caseId) {
            await this.caseRepo.attachSession(caseId, newSession.id);
        }

        return newSession.id;
    }

    async addDtcCodes(sessionId: string, userId: string, rawCodes: string[]): Promise<ParsedDtc[]> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');
        }
        if (session.userId !== userId) {
            this.logger.warn('[SessionService] addDtcCodes forbidden', {
                sessionId,
                userId,
                ownerId: session.userId,
            });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not own this session', 403);
        }
        if (rawCodes.length === 0) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'At least one DTC code is required');
        }

        // One invalid code rejects the whole batch: a partial write would
        // leave the session and the ledger disagreeing about what was read.
        const { parsed, failures } = parseDtcBatch(rawCodes);
        if (failures.length > 0) {
            const reasons = failures.map((failure) => `'${failure.raw}': ${failure.reason}`).join('; ');
            throw new AppError(ErrorCode.INVALID_INPUT, `Invalid DTC code(s): ${reasons}`);
        }

        const codes = parsed.map((code) => code.code);

        // The ledger is the source of truth for case evidence, so a failed
        // ledger write must block the session write, not follow it.
        if (session.caseId) {
            await this.caseRepo.appendEntry(session.caseId, {
                type: 'dtc_read',
                actor: { kind: 'user', id: userId },
                source: 'OBD',
                occurredAt: new Date(),
                payload: { codes },
            });
        }

        await this.sessionRepo.addObdCodes(sessionId, codes);
        this.logger.info('[SessionService] DTC codes recorded', { sessionId, codes });
        return parsed;
    }

    async recordObdScan(sessionId: string, userId: string, scan: ObdScanResult): Promise<ObdScanResult> {
        const parsed = ObdScanResultSchema.safeParse(scan);
        if (!parsed.success) {
            const reasons = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
            throw new AppError(ErrorCode.INVALID_INPUT, `Invalid OBD scan: ${reasons}`);
        }
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');
        }
        if (session.userId !== userId) {
            this.logger.warn('[SessionService] recordObdScan forbidden', {
                sessionId,
                userId,
                ownerId: session.userId,
            });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not own this session', 403);
        }

        // The ledger is the source of truth for case evidence, so a failed
        // ledger write must block the session write, not follow it.
        if (session.caseId) {
            await this.caseRepo.appendEntry(session.caseId, {
                type: 'obd_scan',
                actor: { kind: 'user', id: userId },
                source: 'OBD',
                occurredAt: new Date(parsed.data.capturedAt),
                payload: parsed.data,
            });
        }

        if (parsed.data.storedCodes.length > 0) {
            await this.sessionRepo.addObdCodes(sessionId, parsed.data.storedCodes);
        }
        this.logger.info('[SessionService] OBD scan recorded', {
            sessionId,
            storedCodes: parsed.data.storedCodes,
            pendingCodes: parsed.data.pendingCodes,
            permanentCodes: parsed.data.permanentCodes,
        });
        return parsed.data;
    }

    async recordObdLedgerEvent(sessionId: string, userId: string, input: ObdLedgerEventInput): Promise<void> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');
        }
        if (session.userId !== userId) {
            this.logger.warn('[SessionService] recordObdLedgerEvent forbidden', {
                sessionId,
                userId,
                ownerId: session.userId,
            });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not own this session', 403);
        }
        if (!session.caseId) {
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                'Session is not attached to a case: OBD evidence needs a case ledger',
            );
        }
        const entry = AppendLedgerEntryInputSchema.safeParse({
            ...input,
            actor: { kind: 'user', id: userId },
            source: 'OBD',
            occurredAt: new Date(),
        });
        if (!entry.success) {
            const reasons = entry.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
            throw new AppError(ErrorCode.INVALID_INPUT, `Invalid OBD ledger event: ${reasons}`);
        }
        await this.caseRepo.appendEntry(session.caseId, entry.data);
        this.logger.info('[SessionService] OBD ledger event recorded', { sessionId, type: input.type });
    }

    async getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found');

        const vehicle = await this.vehicleRepo.findById(session.vehicleId, session.userId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Vehicle not found');

        return { session, vehicle };
    }

    async addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void> {
        await this.sessionRepo.addMessage(sessionId, role, content);
    }

    async deleteSession(sessionId: string, userId: string): Promise<void> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found', 404);
        }

        if (session.userId !== userId) {
            this.logger.warn('[SessionService] deleteSession forbidden', {
                sessionId,
                userId,
                ownerId: session.userId,
            });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this session', 403);
        }

        await this.sessionRepo.delete(sessionId);
        this.logger.info('[SessionService] Session deleted', { sessionId, userId });
    }
}
