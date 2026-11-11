import { injectable, inject } from 'inversify';
import type { ILogger, IBillingService, IGoogleSearchService } from '@lemonade/core';
import { SearchRequest, SearchResponse, SearchResultItem, AppError, ErrorCode } from '@lemonade/core';
import { TYPES } from '../di/types';
import type { IConfigProvider } from '../interfaces/IConfigProvider';

interface TavilySearchResult {
    title: string;
    url: string;
    content: string;
    score: number;
    raw_content: string | null;
    published_date?: string;
}

interface TavilySearchResponse {
    query: string;
    results: TavilySearchResult[];
}

interface TavilySearchRequest {
    query: string;
    search_depth: 'basic';
    max_results: number;
    include_answer: false;
    include_raw_content: 'markdown';
}

function extractHostname(pageUrl: string): string | undefined {
    try {
        return new URL(pageUrl).hostname;
    } catch {
        return undefined;
    }
}

@injectable()
export class TavilySearchService implements IGoogleSearchService {
    private readonly searchUrl = 'https://api.tavily.com/search';
    // Extracted page content is capped per result: full pages can run to tens of
    // kilobytes, and the results go straight into the mechanic's model context.
    private readonly maxRawContentChars = 4000;

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.ConfigProvider) private configProvider: IConfigProvider,
    ) {}

    async search(request: SearchRequest): Promise<SearchResponse> {
        const apiKey = this.configProvider.getOrThrow('TAVILY_API_KEY');

        try {
            const requestBody: TavilySearchRequest = {
                query: request.query,
                search_depth: 'basic',
                max_results: request.limit ?? 3,
                include_answer: false,
                include_raw_content: 'markdown',
            };

            const response = await fetch(this.searchUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (request.userId) {
                this.billingService
                    .recordUsage({
                        userId: request.userId,
                        sessionId: request.sessionId,
                        inputTokens: 0,
                        outputTokens: 0,
                        model: 'tavily-search',
                        timestamp: new Date(),
                        searchQueries: 1,
                    })
                    .catch((err) => this.logger.error('[TavilySearchService] Failed to record usage', err as Error));
            }

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`[TavilySearchService] API Error: ${response.status} - ${errorText}`);
                throw new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, `Tavily Search Failed: ${response.statusText}`);
            }

            const payload = (await response.json()) as TavilySearchResponse;

            if (!payload.results) {
                this.logger.info('[TavilySearchService] No results found', { query: request.query });
                return { results: [], queryUsed: request.query, totalFound: 0 };
            }

            const results = payload.results.map((item) => this.toSearchResultItem(item));

            return {
                results,
                queryUsed: request.query,
                totalFound: results.length,
            };
        } catch (error) {
            if (error instanceof AppError) throw error;

            this.logger.error('[TavilySearchService] Request failed', error as Error);
            throw new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, 'Tavily Search Request Failed');
        }
    }

    private toSearchResultItem(item: TavilySearchResult): SearchResultItem {
        const rawContent =
            typeof item.raw_content === 'string' && item.raw_content.length > 0 ? item.raw_content : undefined;

        return {
            title: item.title,
            link: item.url,
            snippet: item.content,
            source: extractHostname(item.url),
            date: item.published_date,
            content: rawContent ? rawContent.slice(0, this.maxRawContentChars) : undefined,
        };
    }
}
