import { DiagnosticSession } from '../entities/DiagnosticSession';
import { Vehicle } from '../entities/Vehicle';
import type { ParsedDtc } from '../dtc/types';
import type { ObdScanResult } from '../obd/types';
import type { ObdLedgerEventInput } from '../types/case';

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
    /**
     * Records a full OBD scan (LM-03). The scan is validated against its
     * schema first: a malformed scan rejects the whole write. When the
     * session belongs to a case it lands in the ledger as one `obd_scan`
     * event; the stored codes are also appended to the session's obdCodes.
     * A session without a case still records its stored codes.
     */
    recordObdScan(sessionId: string, userId: string, scan: ObdScanResult): Promise<ObdScanResult>;
    /**
     * Records one OBD ledger event after the scan (LM-03): a guided-test
     * outcome, a saved fault window, or a verify-fix verdict. Requires a
     * session attached to a case — without a ledger there is nowhere to
     * record it.
     */
    recordObdLedgerEvent(sessionId: string, userId: string, input: ObdLedgerEventInput): Promise<void>;
}
