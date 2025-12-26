import { NextRequest } from 'next/server';
import { RequestContext } from '@lemonade/infrastructure';
import { v4 as uuidv4 } from 'uuid';

type RouteHandler = (req: NextRequest, context: Record<string, unknown>) => Promise<Response> | Response;

export function withContext(handler: RouteHandler): (req: NextRequest, context: Record<string, unknown>) => Promise<Response> {
    return async (req: NextRequest, context: Record<string, unknown>) => {
        const traceId = req.headers.get('x-trace-id') || uuidv4();
        
        return RequestContext.run({ traceId }, async () => {
            return handler(req, context);
        });
    };
}

