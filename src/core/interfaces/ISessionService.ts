import { DiagnosticSession } from '../entities/DiagnosticSession';
import { Vehicle } from '../entities/Vehicle';

/**
 * Service for managing diagnostic session lifecycle and context.
 * Handles session creation, retrieval, and message persistence.
 */
export interface ISessionService {
    startSession(vehicleId: string): Promise<string>;
    getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }>;
    addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void>;
}
