import type { EvidenceChildRequest, EvidenceChildSummary, SearchResponse } from '@lemonade/core';
import { WebSearchEvidenceSource } from './WebSearchEvidenceSource';

/**
 * Known failures (LM-18). The live web index, queried for the common
 * problems and known failures of this vehicle — plus the tech's symptom
 * when the launch came from partial speech. A failed search throws, and
 * the runner records 'unknown', never 'none'.
 */
export class KnownFailureSource extends WebSearchEvidenceSource {
    readonly kind = 'known_failure' as const;

    canRun(request: EvidenceChildRequest): boolean {
        return super.canRun(request) || request.symptom !== undefined;
    }

    protected buildQuery(request: EvidenceChildRequest): string {
        const vehicle =
            request.year !== undefined && request.make !== undefined && request.model !== undefined
                ? this.vehicleLabel(request)
                : 'vehicle';
        const symptom = request.symptom === undefined ? '' : ` ${request.symptom}`;
        return `${vehicle}${symptom} common problems known failures`;
    }

    protected toSummary(request: EvidenceChildRequest, response: SearchResponse): EvidenceChildSummary {
        const vehicle =
            request.year !== undefined && request.make !== undefined && request.model !== undefined
                ? this.vehicleLabel(request)
                : 'this vehicle';
        if (response.results.length === 0) {
            return {
                kind: 'known_failure',
                status: 'none',
                summary: `No widely reported known failures found for the ${vehicle}.`,
                items: [],
                source: 'Tavily web search',
            };
        }
        return {
            kind: 'known_failure',
            status: 'found',
            summary: `${response.results.length} known-failure report${response.results.length === 1 ? '' : 's'} for the ${vehicle}.`,
            items: this.itemsFrom(response),
            source: 'Tavily web search',
        };
    }
}
