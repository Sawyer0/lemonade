import { RequestContext } from '@lemonade/infrastructure';
import { v4 as uuidv4 } from 'uuid';

/**
 * Wraps a Next.js route handler so everything it calls shares one trace ID,
 * taken from the incoming x-trace-id header or generated here.
 */
export function withContext<Req extends Request, Ctx = unknown>(
    handler: (req: Req, context: Ctx) => Promise<Response> | Response,
): (req: Req, context: Ctx) => Promise<Response> {
    return async (req: Req, context: Ctx) => {
        const traceId = req.headers.get('x-trace-id') || uuidv4();
        return RequestContext.run({ traceId }, async () => handler(req, context));
    };
}
