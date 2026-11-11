import { injectable, inject, LazyServiceIdentifier } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { ISessionRepository, IVehicleRepository, ILogger, ICaseRepository } from '@lemonade/core';
import { ISessionService, DiagnosticSession, Vehicle, AppError, ErrorCode } from '@lemonade/core';
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
