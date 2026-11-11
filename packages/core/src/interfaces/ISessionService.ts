import { DiagnosticSession } from '../entities/DiagnosticSession';
import { Vehicle } from '../entities/Vehicle';

export interface ISessionService {
    startSession(vehicleId: string, userId: string, caseId?: string): Promise<string>;
    getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }>;
    addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void>;
    deleteSession(sessionId: string, userId: string): Promise<void>;
}
