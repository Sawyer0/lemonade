import type { AppendLedgerEntryInput, Case, CreateCaseInput, LedgerEntry } from '../types/case';

// The ledger lives in Postgres (fleet queries, exports, and the counts behind
// field-fix priors). Firestore stays for realtime session state; sessions link
// to a case through the session's caseId and the case_sessions table here.
export interface ICaseRepository {
    createCase(input: CreateCaseInput): Promise<Case>;
    findCaseById(id: string): Promise<Case | null>;
    findCasesByVehicleId(vehicleId: string): Promise<Case[]>;
    appendEntry(caseId: string, input: AppendLedgerEntryInput): Promise<LedgerEntry>;
    listEntries(caseId: string): Promise<LedgerEntry[]>;
    verifyLedger(caseId: string): Promise<boolean>;
    attachSession(caseId: string, sessionId: string): Promise<void>;
    listSessions(caseId: string): Promise<string[]>;
}
