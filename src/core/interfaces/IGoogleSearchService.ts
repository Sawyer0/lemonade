import { SearchRequest, SearchResponse } from '@/application/dtos/verification.dto';

export interface IGoogleSearchService {
    search(request: SearchRequest): Promise<SearchResponse>;
}
