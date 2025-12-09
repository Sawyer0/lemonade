import { injectable, inject } from 'inversify';
import { TYPES } from '@/infrastructure/di/types';
import type { ISessionService } from '@/core/interfaces/ISessionService';
import type { ISessionRepository } from '@/core/interfaces/ISessionRepository';
import type { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import type { ILogger } from '@/core/interfaces/ILogger';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { Vehicle } from '@/core/entities/Vehicle';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import { v4 as uuidv4 } from 'uuid';

@injectable()
export class SessionService implements ISessionService {
    constructor(
        @inject(TYPES.SessionRepo) private sessionRepo: ISessionRepository,
        @inject(TYPES.VehicleRepo) private vehicleRepo: IVehicleRepository,
        @inject(TYPES.Logger) private logger: ILogger
    ) {}

    async startSession(vehicleId: string): Promise<string> {
        const vehicle = await this.vehicleRepo.findById(vehicleId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");

        const newSession: DiagnosticSession = {
            id: uuidv4(),
            vehicleId: vehicle.id,
            userId: vehicle.userId,
            status: 'active',
            complaint: 'New Session',
            obdCodes: [],
            messages: [],
            updatedAt: new Date(),
            startedAt: new Date(),
            aiAnalysis: null,
            safety_stop: false // Initialize safety stop status
        };

        await this.sessionRepo.create(newSession);
        return newSession.id;
    }

    async getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }> {
        const session = await this.sessionRepo.findById(sessionId);
        if (!session) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Session not found");

        const vehicle = await this.vehicleRepo.findById(session.vehicleId);
        if (!vehicle) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, "Vehicle not found");

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
            this.logger.warn('[SessionService] deleteSession forbidden', { sessionId, userId, ownerId: session.userId });
            throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to delete this session', 403);
        }

        await this.sessionRepo.delete(sessionId);
        this.logger.info('[SessionService] Session deleted', { sessionId, userId });
    }
}
