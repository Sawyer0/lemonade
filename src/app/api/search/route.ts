import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IGoogleSearchService, SearchResponse, SearchRequestSchema } from '@lemonade/core';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

export const POST = withContext(async (req: Request) => {
    try {
        const body = await validateRequest(req, SearchRequestSchema);
        const searchService = container.get<IGoogleSearchService>(TYPES.GoogleSearchService);
        const results: SearchResponse = await searchService.search({
            ...body,
            limit: body.limit ?? 3,
        });
        return NextResponse.json(results);
    } catch (error) {
        return createErrorResponse(error);
    }
});
