import { injectable, inject } from 'inversify';
import type { ILogger, IBillingService } from '@lemonade/core';
import {
    IGoogleSearchService,
    SearchRequest,
    SearchResponse,
    AppError,
    ErrorCode
} from '@lemonade/core';
import { TYPES } from '../di/types';
import type { IConfigProvider } from '../interfaces/IConfigProvider';

@injectable()
export class GoogleSearchService implements IGoogleSearchService {
    private readonly BASE_URL = 'https://www.googleapis.com/customsearch/v1';

    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.BillingService) private billingService: IBillingService,
        @inject(TYPES.ConfigProvider) private configProvider: IConfigProvider
    ) { }

    async search(request: SearchRequest): Promise<SearchResponse> {
        const apiKey = this.configProvider.getOrThrow('GOOGLE_SEARCH_API_KEY');
        const cx = this.configProvider.getOrThrow('GOOGLE_SEARCH_CX');

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
                }).catch(err => this.logger.error('[GoogleSearchService] Failed to record usage', err as Error));
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

            this.logger.error('[GoogleSearchService] Request failed', error as Error);
            throw new AppError(ErrorCode.EXTERNAL_SERVICE_ERROR, "Google Search Request Failed");
        }
    }
}
