import type { EvidenceChildRequest, EvidenceChildSummary, SearchResponse } from '@lemonade/core';
import { WebSearchEvidenceSource } from './WebSearchEvidenceSource';

/**
 * Technical service bulletins (LM-18). There is no live TSB API in the
 * repo — the NHTSA TSB summaries live in offline flat files behind the
 * LM-33 priors — so this child reads the live web index through the search
 * service. A TSB is manufacturer guidance, not a confirmed fix: the summary
 * says so, and the status is 'none' only when the search answers with
 * nothing. A failed search throws, and the runner records 'TSB status
 * unknown', never 'no TSBs'.
 */
export class TsbSource extends WebSearchEvidenceSource {
    readonly kind = 'tsb' as const;

    protected buildQuery(request: EvidenceChildRequest): string {
        const component = request.component === undefined ? '' : ` ${request.component}`;
        return `${this.vehicleLabel(request)} technical service bulletin${component}`;
    }

    protected toSummary(request: EvidenceChildRequest, response: SearchResponse): EvidenceChildSummary {
        const vehicle = this.vehicleLabel(request);
        if (response.results.length === 0) {
            return {
                kind: 'tsb',
                status: 'none',
                summary: `No technical service bulletins found for the ${vehicle}.`,
                items: [],
                source: 'Tavily web search',
            };
        }
        return {
            kind: 'tsb',
            status: 'found',
            summary: `${response.results.length} technical service bulletin${response.results.length === 1 ? '' : 's'} for the ${vehicle}. TSBs are manufacturer guidance, not confirmed fixes.`,
            items: this.itemsFrom(response),
            source: 'Tavily web search',
        };
    }
}
