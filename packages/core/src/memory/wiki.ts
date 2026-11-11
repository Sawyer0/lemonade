import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import type { WikiPage } from '../types/learnedMemory';

/**
 * Shop make/model wiki (LM-31). One page per vehicle family, built only from
 * confirmed repairs. It quotes ledger entries verbatim instead of summarizing
 * and links back to cases. A size check flags any page that grows past its
 * sources.
 */

export interface ConfirmedRepairQuote {
    family: string;
    caseId: string;
    ledgerEventId: string;
    quote: string;
}

export function buildWikiPage(
    shopId: string,
    family: string,
    repairs: ReadonlyArray<ConfirmedRepairQuote>,
    now: string,
    pageId: string,
    existing: WikiPage | null,
): WikiPage {
    if (repairs.length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'A wiki page needs at least one confirmed repair.');
    }
    const seen = new Map<string, { ledgerEventId: string; caseId: string; quote: string }>();
    for (const repair of repairs) {
        if (repair.family !== family) {
            throw new AppError(
                ErrorCode.VALIDATION_ERROR,
                `Repair for case ${repair.caseId} belongs to another family.`,
            );
        }
        if (repair.quote.trim().length === 0) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, 'A wiki quote may not be empty.');
        }
        seen.set(repair.ledgerEventId, {
            ledgerEventId: repair.ledgerEventId,
            caseId: repair.caseId,
            quote: repair.quote,
        });
    }
    const quotes = [...seen.values()];
    const caseIds = [...new Set(quotes.map((quote) => quote.caseId))];
    return {
        pageId: existing ? existing.pageId : pageId,
        shopId,
        family,
        quotes,
        caseIds,
        updatedAt: now,
    };
}

/** Every cited case must be a confirmed-repair case. */
export function validateWikiPage(page: WikiPage, confirmedCaseIds: ReadonlyArray<string>): void {
    for (const caseId of page.caseIds) {
        if (!confirmedCaseIds.includes(caseId)) {
            throw new AppError(
                ErrorCode.VALIDATION_ERROR,
                `Wiki page ${page.pageId} cites case ${caseId} with no confirmed repair.`,
            );
        }
    }
}

/** Flags a page whose quoted text grew past the source ledger text it cites. */
export function checkWikiSize(page: WikiPage, sourceLedgerChars: number): { ok: boolean; reason?: string } {
    const quotedChars = page.quotes.reduce((total, quote) => total + quote.quote.length, 0);
    if (quotedChars > sourceLedgerChars) {
        return { ok: false, reason: 'page-grew-past-sources' };
    }
    return { ok: true };
}
