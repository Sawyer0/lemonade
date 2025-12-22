import { NextRequest, NextResponse } from 'next/server';
import { RequestContext } from '@lemonade/infrastructure';
import { v4 as uuidv4 } from 'uuid';

type RouteHandler = (req: NextRequest, context?: unknown) => Promise<NextResponse> | NextResponse;

export function withContext(handler: RouteHandler): RouteHandler {
    return async (req: NextRequest, context?: unknown) => {
        const traceId = req.headers.get('x-trace-id') || uuidv4();
        
        return RequestContext.run({ traceId }, async () => {
            return handler(req, context);
        });
    };
}

