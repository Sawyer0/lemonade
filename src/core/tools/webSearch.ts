import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

/**
 * webSearch Tool Definition
 * 
 * This tool enables Gemini to search the web for real-time information
 * about vehicle diagnostics, recalls, service bulletins, and repair procedures.
 */
export const WEB_SEARCH_TOOL: FunctionDeclaration = {
    name: 'webSearch',
    description: `Search the web for automotive information including:
- Technical Service Bulletins (TSBs)
- Vehicle recalls and safety issues
- OBD-II code meanings and fixes
- Torque specifications and repair procedures
- Parts compatibility and availability
- Common issues for specific vehicle models`,
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            query: {
                type: SchemaType.STRING,
                description: 'The search query (e.g., "2018 Ford F-150 P0300 misfire fix", "Toyota Camry transmission recall")'
            },
            searchType: {
                type: SchemaType.STRING,
                enum: ['tsb', 'recall', 'obd_code', 'torque_spec', 'repair_procedure', 'parts', 'general'],
                description: 'The type of information being searched for'
            }
        },
        required: ['query']
    }
};

/**
 * Search Request Interface
 */
export interface WebSearchRequest {
    query: string;
    searchType?: 'tsb' | 'recall' | 'obd_code' | 'torque_spec' | 'repair_procedure' | 'parts' | 'general';
}

/**
 * Search Result Interface
 */
export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
}

/**
 * Search Response Interface
 */
export interface WebSearchResponse {
    query: string;
    results: WebSearchResult[];
    totalResults: number;
    searchTime: number;
}
