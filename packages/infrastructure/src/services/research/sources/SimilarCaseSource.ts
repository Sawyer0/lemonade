import type { EvidenceChildRequest, EvidenceChildSource, EvidenceChildSummary } from '@lemonade/core';
import type { ICaseRepository } from '@lemonade/core';

/** Max similar cases one summary carries; the reasoner's context stays small. */
const MAX_SIMILAR_CASE_ITEMS = 5;

/**
 * Similar closed cases (LM-18). Reads the case ledger's confirmed outcomes
 * for this vehicle: only outcomes the tech confirmed fixed count as proof a
 * repair worked, so only those are reported. Runs only when the case's
 * vehicle is known. A failed ledger read throws, and the runner records
 * 'unknown', never 'none'.
 */
export class SimilarCaseSource implements EvidenceChildSource {
    readonly kind = 'similar_case' as const;

    constructor(private readonly caseRepo: ICaseRepository) {}

    canRun(request: EvidenceChildRequest): boolean {
        return request.vehicleId !== undefined;
    }

    async lookup(request: EvidenceChildRequest): Promise<EvidenceChildSummary> {
        const outcomes = await this.caseRepo.findConfirmedOutcomes(request.vehicleId!);
        if (outcomes.length === 0) {
            return {
                kind: 'similar_case',
                status: 'none',
                summary: 'No similar closed cases with a confirmed fix for this vehicle.',
                items: [],
                source: 'case ledger',
            };
        }
        const shown = outcomes.slice(0, MAX_SIMILAR_CASE_ITEMS);
        return {
            kind: 'similar_case',
            status: 'found',
            summary: `${outcomes.length} similar closed case${outcomes.length === 1 ? '' : 's'} with a confirmed fix for this vehicle${outcomes.length > shown.length ? `; showing ${shown.length}` : ''}.`,
            items: shown.map((entry) => {
                const repair = entry.type === 'outcome' ? entry.payload.repairPerformed : 'confirmed fix';
                return { title: repair, detail: `Case ${entry.caseId}, entry #${entry.sequence}` };
            }),
            source: 'case ledger',
        };
    }
}
