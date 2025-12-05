import { describe, it, expect } from 'vitest';
import { SchemaType } from '@google-cloud/vertexai';
import { WEB_SEARCH_TOOL, WebSearchRequest } from '../webSearch';

/**
 * These tests verify the webSearch tool definition is correct.
 * 
 * WHAT BUGS WOULD THIS CATCH?
 * - Missing required fields in the schema
 * - Wrong parameter types that would cause Gemini to fail
 * - Missing search types that the AI needs
 * - Typos in enum values that would break tool calls
 */
describe('WEB_SEARCH_TOOL Definition', () => {
    it('should have the correct tool name', () => {
        // If someone renames this, the AI SDK integration breaks
        expect(WEB_SEARCH_TOOL.name).toBe('webSearch');
    });

    it('should have a description that mentions automotive use cases', () => {
        // The description guides Gemini on WHEN to use this tool
        // If it's vague, Gemini won't know to search for TSBs/recalls
        const description = WEB_SEARCH_TOOL.description?.toLowerCase() ?? '';
        
        expect(description).toContain('tsb');
        expect(description).toContain('recall');
        expect(description).toContain('obd');
        expect(description).toContain('torque');
    });

    it('should require query parameter', () => {
        // Without a required query, Gemini could call the tool with empty params
        expect(WEB_SEARCH_TOOL.parameters?.required).toContain('query');
    });

    it('should have query as STRING type', () => {
        // Wrong type = Gemini sends wrong data = API fails
        const queryProp = WEB_SEARCH_TOOL.parameters?.properties?.query;
        expect(queryProp?.type).toBe(SchemaType.STRING);
    });

    it('should have all valid searchType enum values', () => {
        // These enums tell Gemini what KIND of search to do
        // Missing one = AI can't categorize certain searches
        const searchTypeProp = WEB_SEARCH_TOOL.parameters?.properties?.searchType;
        const expectedTypes = ['tsb', 'recall', 'obd_code', 'torque_spec', 'repair_procedure', 'parts', 'general'];
        
        expect(searchTypeProp?.enum).toEqual(expectedTypes);
    });

    it('should NOT require searchType (optional for flexibility)', () => {
        // searchType should be optional so AI can search without categorizing
        expect(WEB_SEARCH_TOOL.parameters?.required).not.toContain('searchType');
    });
});

describe('WebSearchRequest Interface Validation', () => {
    it('should accept valid request with only query', () => {
        // Minimum valid request
        const request: WebSearchRequest = {
            query: '2018 Ford F-150 P0300 misfire'
        };
        
        expect(request.query).toBeDefined();
        expect(request.searchType).toBeUndefined();
    });

    it('should accept valid request with searchType', () => {
        const request: WebSearchRequest = {
            query: 'Toyota Camry transmission recall 2020',
            searchType: 'recall'
        };
        
        expect(request.query).toBeDefined();
        expect(request.searchType).toBe('recall');
    });

    it('should type-check searchType values', () => {
        // This is a compile-time check, but we document the valid values
        const validTypes: WebSearchRequest['searchType'][] = [
            'tsb', 'recall', 'obd_code', 'torque_spec', 'repair_procedure', 'parts', 'general'
        ];
        
        validTypes.forEach(type => {
            const request: WebSearchRequest = { query: 'test', searchType: type };
            expect(request.searchType).toBe(type);
        });
    });
});
