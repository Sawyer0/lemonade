import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { INHTSAService } from '@lemonade/core';
import { validateQueryParams, createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';

const RecallsRequestSchema = z.object({
    year: z.coerce.number(),
    make: z.string().min(1),
    model: z.string().min(1),
});

export const GET = withContext(async (req: Request) => {
    try {
        const { year, make, model } = validateQueryParams(req, RecallsRequestSchema);

        const nhtsaService = container.get<INHTSAService>(TYPES.NHTSAService);
        const recalls = await nhtsaService.checkRecalls(year, make, model);

        return NextResponse.json({ recalls });
    } catch (error) {
        return createErrorResponse(error);
    }
});
