import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IVectorRepository, VectorDocument, SimilarCase } from '@lemonade/core';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

// Schemas for Vector Operations
const VectorActionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('search'),
        query: z.string().min(1),
        limit: z.number().int().positive().optional().default(3),
        filter: z.record(z.unknown()).optional(),
    }),
    z.object({
        action: z.literal('findSimilar'),
        vector: z.array(z.number()),
        limit: z.number().int().positive().optional().default(3),
        filter: z.object({ userId: z.string().optional() }).optional(),
    }),
    z.object({
        action: z.literal('addCase'),
        text: z.string().min(1),
        vector: z.array(z.number()),
        metadata: z.record(z.unknown()).optional(),
    }),
]);

export const POST = withContext(async (req: Request) => {
    try {
        const body = await validateRequest(req, VectorActionSchema);
        const vectorRepo = container.get<IVectorRepository>(TYPES.VectorRepository);

        if (body.action === 'search') {
            const results: VectorDocument[] = await vectorRepo.search(body.query, body.limit, body.filter);
            return NextResponse.json({ results });
        } else if (body.action === 'findSimilar') {
            const results: SimilarCase[] = await vectorRepo.findSimilar(body.vector, body.limit, body.filter);
            return NextResponse.json({ results });
        } else if (body.action === 'addCase') {
            await vectorRepo.addCase(body.text, body.vector, body.metadata);
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return createErrorResponse(error);
    }
});
