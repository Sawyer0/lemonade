import type { Case, LedgerEntry, OutcomePayload } from '../types/case';

/** A case with its full evidence ledger, in sequence order. */
export interface CaseWithEntries {
    caseRecord: Case;
    entries: LedgerEntry[];
}

/** The result of closing a case: the closed case and its outcome entry. */
export interface CloseCaseResult {
    closedCase: Case;
    outcomeEntry: LedgerEntry;
}

// LM-05: closing a case records the repair outcome and flips the case to
// closed in one step. Only the case owner may close it, and a closed case is
// read-only — no further entries, and no second close.
// Named CloseCaseResult (not CaseCloseResult): memory scopes already export
// a CaseCloseResult for the profile/record updates applied at case close
// (packages/core/src/memory/techProfilePolicy.ts). This one is the service
// result: the closed case and its outcome entry.
export interface ICaseService {
    getCase(caseId: string, userId: string): Promise<CaseWithEntries>;
    closeCase(caseId: string, userId: string, outcome: OutcomePayload): Promise<CloseCaseResult>;
}
