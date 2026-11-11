import { DiagnosticSession } from '../entities/DiagnosticSession';
import { Vehicle } from '../entities/Vehicle';
import type { ParsedDtc } from '../dtc/types';

export interface ISessionService {
    startSession(vehicleId: string, userId: string, caseId?: string): Promise<string>;
    getSessionContext(sessionId: string): Promise<{ session: DiagnosticSession; vehicle: Vehicle }>;
    addMessage(sessionId: string, role: 'user' | 'assistant' | 'system', content: unknown): Promise<void>;
    deleteSession(sessionId: string, userId: string): Promise<void>;
    /**
     * Parses raw DTC strings (LM-02) and records the parsed codes on the
     * session. Every raw code must parse: one invalid code rejects the whole
     * batch with its reason and nothing is written. Codes are appended to
     * the session's obdCodes and, when the session belongs to a case, written
     * to the case ledger as a `dtc_read` event.
     */
    addDtcCodes(sessionId: string, userId: string, rawCodes: string[]): Promise<ParsedDtc[]>;
}
