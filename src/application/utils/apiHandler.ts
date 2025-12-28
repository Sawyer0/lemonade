import { NextRequest } from 'next/server';
import { RequestContext } from '@lemonade/infrastructure';
import { v4 as uuidv4 } from 'uuid';

type RouteHandler = (req: any, context: any) => Promise<Response> | Response;

export function withContext(handler: RouteHandler): (req: any, context: any) => Promise<Response> {
    return async (req: any, context: any) => {
        const traceId = (req instanceof Request ? req.headers.get('x-trace-id') : null) || uuidv4();
        
        return RequestContext.run({ traceId }, async () => {
            return handler(req, context);
        });
    };
}

