/**
 * One prior confirmed fix for this vehicle (LM-31). The vehicle history
 * the reasoner reads is not a third-party memory document: it is the case
 * ledger's confirmed outcomes for the vehicle — only outcomes the tech
 * confirmed fixed count as proof a repair worked — rendered as a line the
 * model can cite. `content` is the only field the reasoner reads; `caseId`
 * and `sequence` keep the line traceable to its ledger entry.
 */
export interface VehicleHistoryEntry {
    /** Human-readable line shown to the reasoner (confirmed fix + case ref). */
    content: string;
    /** Case the entry comes from. */
    caseId: string;
    /** Ledger sequence of the outcome entry. */
    sequence: number;
}
