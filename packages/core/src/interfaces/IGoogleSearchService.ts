import { SearchRequest, SearchResponse } from '../types/verification';

export interface IGoogleSearchService {
    search(request: SearchRequest): Promise<SearchResponse>;
}
