import type { EvidenceChildRequest, EvidenceChildSource, EvidenceChildSummary } from '@lemonade/core';
import type { IGoogleSearchService, SearchResponse } from '@lemonade/core';

/** Max search hits one summary carries; the reasoner's context stays small. */
const MAX_SEARCH_ITEMS = 5;

/** Shared shape for the two web-search children (TSBs, known failures). */
export abstract class WebSearchEvidenceSource implements EvidenceChildSource {
    abstract readonly kind: EvidenceChildSource['kind'];

    constructor(protected readonly search: IGoogleSearchService) {}

    canRun(request: EvidenceChildRequest): boolean {
        return request.year !== undefined && request.make !== undefined && request.model !== undefined;
    }

    async lookup(request: EvidenceChildRequest): Promise<EvidenceChildSummary> {
        const response = await this.search.search({ query: this.buildQuery(request), limit: MAX_SEARCH_ITEMS });
        return this.toSummary(request, response);
    }

    protected abstract buildQuery(request: EvidenceChildRequest): string;
    protected abstract toSummary(request: EvidenceChildRequest, response: SearchResponse): EvidenceChildSummary;

    protected vehicleLabel(request: EvidenceChildRequest): string {
        return `${request.year} ${request.make} ${request.model}`;
    }

    protected itemsFrom(response: SearchResponse): EvidenceChildSummary['items'] {
        return response.results.slice(0, MAX_SEARCH_ITEMS).map((result) => ({
            title: result.title,
            detail: result.snippet,
        }));
    }
}
