import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IChatService, ILogger, IEdgeSecurityService, VehicleContext, AIAnalysis, MessagePart } from '@lemonade/core';
import { withContext } from '@/application/utils/apiHandler';
import { RequestContext } from '@lemonade/infrastructure';

export const maxDuration = 60; // Timeout handling

export const POST = withContext(async function POST(req: Request): Promise<NextResponse> {
    // 1. Generate/Get Trace ID (Distributed Tracing Start)
    const logger = container.get<ILogger>(TYPES.Logger);
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);
    logger.info(`Chat Request Started`, { path: req.url });
    const traceId = RequestContext.getTraceId();

    try {
        // 2. Authentication
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized: Middleware bypass detected' }, { status: 401 });
        }

        const { messages, vehicleContext, diagnosticContext } = (await req.json()) as {
            messages: { role: string; content: string | MessagePart[] }[];
            vehicleContext?: VehicleContext;
            diagnosticContext?: AIAnalysis;
        };
        const sessionId = req.headers.get('x-session-id') || '00000000-0000-0000-0000-000000000000';

        // 3. Resolve Chat Service
        const chatService = container.get<IChatService>(TYPES.ChatService);

        // 4. Extract latest user message
        const latestMessage = messages[messages.length - 1];

        if (!latestMessage || latestMessage.role !== 'user') {
            return NextResponse.json({ error: 'Invalid request: No user message found' }, { status: 400 });
        }

        // 5. Execute Logic via ChatService (Streaming)
        // Pass overrides if provided
        const stream = chatService.handleChatInteractionStream(
            sessionId,
            latestMessage.content,
            vehicleContext as VehicleContext,
            diagnosticContext as AIAnalysis,
        );

        // 6. Convert AsyncGenerator to NDJSON stream for the response
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const event of stream) {
                        controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + '\n'));
                    }
                    controller.close();
                } catch (err) {
                    logger.error('Streaming error in route', err);
                    controller.error(err);
                }
            },
        });

        // Return as a stream response
        return new NextResponse(readableStream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'x-trace-id': traceId,
            },
        });
    } catch (error: unknown) {
        logger.error(`Chat Failed`, error);
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
});
