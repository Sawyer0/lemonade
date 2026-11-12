import type { EvidenceChildRequest, EvidenceChildSource, EvidenceChildSummary } from '@lemonade/core';
import { nhtsaComponentsMatch } from '@lemonade/core';
import type { INHTSAService } from '@lemonade/core';

/** Max recalls one summary carries; the reasoner's context stays small. */
const MAX_RECALL_ITEMS = 5;

/**
 * NHTSA recalls by component (LM-18). Runs only when the year, make and
 * model are known. Uses the strict recall lookup, so a failed lookup throws
 * and the runner records 'recall status unknown' — never 'no recalls'.
 * When the request names a component, recalls are filtered with LM-33's
 * segment-wise component match, never a substring.
 */
export class NhtsaRecallSource implements EvidenceChildSource {
    readonly kind = 'recall' as const;

    constructor(private readonly nhtsa: INHTSAService) {}

    canRun(request: EvidenceChildRequest): boolean {
        return request.year !== undefined && request.make !== undefined && request.model !== undefined;
    }

    async lookup(request: EvidenceChildRequest): Promise<EvidenceChildSummary> {
        const year = request.year!;
        const make = request.make!;
        const model = request.model!;
        const recalls = await (this.nhtsa.checkRecallsStrict?.(year, make, model) ??
            this.nhtsa.checkRecalls(year, make, model));
        const matching =
            request.component === undefined
                ? recalls
                : recalls.filter((recall) => nhtsaComponentsMatch(request.component!, recall.Component));
        const vehicle = `${year} ${make} ${model}`;
        if (matching.length === 0) {
            return {
                kind: 'recall',
                status: 'none',
                summary:
                    request.component === undefined
                        ? `No recalls found for the ${vehicle}.`
                        : `No recalls found for the ${vehicle} matching component ${request.component}.`,
                items: [],
                source: 'NHTSA',
            };
        }
        const shown = matching.slice(0, MAX_RECALL_ITEMS);
        return {
            kind: 'recall',
            status: 'found',
            summary: `${matching.length} recall${matching.length === 1 ? '' : 's'} for the ${vehicle}${matching.length > shown.length ? `; showing ${shown.length}` : ''}.`,
            items: shown.map((recall) => ({
                title: recall.Component,
                detail: `Campaign ${recall.NHTSACampaignNumber || 'unknown'}: ${recall.Summary}`,
            })),
            source: 'NHTSA',
        };
    }
}
