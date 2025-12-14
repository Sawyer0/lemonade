import { FunctionDeclaration, SchemaType } from '@google-cloud/vertexai';

export const GOOGLE_SEARCH_TOOL: FunctionDeclaration = {
    name: 'google_search',
    description: 'Performs a Google Search to find real-world information, technical specs, or verify facts. Use this when you do not know the answer or need external confirmation.',
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            query: {
                type: SchemaType.STRING,
                description: 'The search query optimized for a search engine (e.g., "2018 F-150 cam phaser recall").'
            }
        },
        required: ['query']
    }
};
