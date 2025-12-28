import { NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IMemoryService, MemorySearchResult } from '@lemonade/core';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';
import { withContext } from '@/application/utils/apiHandler';

// Define schemas for multiplexed operations
const MemoryFilterSchema = z.object({
    field: z.string(),
    operator: z.enum(['eq', 'contains', 'not_eq', 'not_contains']),
    value: z.string(),
    ignoreCase: z.boolean().optional()
});

const MemorySearchOptionsSchema = z.object({
    spaceId: z.string().optional(),
    limit: z.number().optional(),
    includeForgotten: z.boolean().optional(),
    filters: z.array(MemoryFilterSchema).optional(),
    tags: z.array(z.string()).optional()
});

const MemoryDocumentSchema = z.object({
    content: z.string().optional(),
    url: z.string().optional(),
    fileUri: z.string().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional()
});

const MemoryActionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('search'),
        query: z.string().min(1),
        options: MemorySearchOptionsSchema.optional()
    }),
    z.object({
        action: z.literal('add'),
        doc: MemoryDocumentSchema,
        spaceId: z.string().optional()
    })
]);

export const POST = withContext(async (req: Request) => {
    try {
        const body = await validateRequest(req, MemoryActionSchema);
        const memoryService = container.get<IMemoryService>(TYPES.SupermemoryService);

        if (body.action === 'search') {
            const results: MemorySearchResult[] = await memoryService.search(body.query, body.options);
            return NextResponse.json({ results });
        } else if (body.action === 'add') {
            await memoryService.addDocument(body.doc, body.spaceId);
            return NextResponse.json({ success: true });
        } else {
            // Should be unreachable due to Zod validation
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        return createErrorResponse(error);
    }
});
