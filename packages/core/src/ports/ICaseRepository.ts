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
    /**
     * Appends an `outcome` entry and flips the case to closed in one
     * transaction, so a case is never closed without its outcome or left
     * open with one. The input must be an `outcome` entry; closing an
     * already-closed case is a conflict.
     */
    closeCase(caseId: string, input: AppendLedgerEntryInput): Promise<{ closedCase: Case; outcomeEntry: LedgerEntry }>;
    /**
     * Confirmed outcomes for one vehicle, newest first. This is the feed for
     * the similar-cases lookup and the field-fix priors (LM-33): only
     * outcomes the tech confirmed fixed count as proof a repair worked.
     */
    findConfirmedOutcomes(vehicleId: string): Promise<LedgerEntry[]>;
    /**
     * Commits one reasoner run (LM-17): atomically advances the case version
     * by one, but only when the stored version still equals `expectedVersion`
     * — the version the run read when it started. Returns the new version.
     * Throws VERSION_CONFLICT (409) when the case has moved on since the run
     * started (another run committed, or a ledger append landed mid-run), and
     * RESOURCE_NOT_FOUND when the case does not exist. A refused commit must
     * never overwrite the newer state.
     */
    advanceCaseVersion(caseId: string, expectedVersion: number): Promise<number>;
}
