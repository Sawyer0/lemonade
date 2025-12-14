import { injectable, inject } from 'inversify';
import {
    IGoogleSearchService,
    SearchRequest,
    SearchResponse,
    ILogger,
    AppError,
    ErrorCode,
    IBillingService
} from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';
import { CONFIG } from '@/infrastructure/config';

@injectable()
export class GoogleSearchService implements IGoogleSearchService {
    private readonly BASE_URL = 'https://www.googleapis.com/customsearch/v1';

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService
    ) { }

    async search(request: SearchRequest): Promise<SearchResponse> {
        const apiKey = CONFIG.GOOGLE.SEARCH_API_KEY;
        const cx = CONFIG.GOOGLE.SEARCH_CX;

        if (!apiKey || !cx) {
            this.logger.error('[GoogleSearchService] Missing Configuration (API_KEY or CX)');
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, "Search Service Configuration Missing");
        }

        try {
            const url = `${this.BASE_URL}?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(request.query)}&num=${request.limit}`;

            const response = await fetch(url);
            if (request.userId) {
                this.billingService.recordUsage({
                    userId: request.userId,
                    sessionId: request.sessionId,
                    inputTokens: 0,
                    outputTokens: 0,
                    model: 'google-custom-search',
                    timestamp: new Date(),
                    searchQueries: 1
                }).catch(err => this.logger.error('[GoogleSearchService] Failed to record usage', err));
            }

            if (!response.ok) {
                const errorText = await response.text();
                this.logger.error(`[GoogleSearchService] API Error: ${response.status} - ${errorText}`);
                throw new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, `Google Search Failed: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.items) {
                this.logger.info('[GoogleSearchService] No results found', { query: request.query });
                return { results: [], queryUsed: request.query, totalFound: 0 };
            }

            const results = data.items.map((item: { title: string; link: string; snippet: string; displayLink: string }) => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                source: item.displayLink
            }));

            return {
                results,
                queryUsed: request.query,
                totalFound: parseInt(data.searchInformation?.totalResults || '0', 10)
            };

        } catch (error) {
            if (error instanceof AppError) throw error;

            this.logger.error('[GoogleSearchService] Request failed', error);
            throw new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, "Google Search Request Failed");
        }
    }
}