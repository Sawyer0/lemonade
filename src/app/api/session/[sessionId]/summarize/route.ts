import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import {
    ISessionRepository,
    ISummarizationService,
    ILogger,
    IEdgeSecurityService,
    MessagePart
} from '@lemonade/core';
import { withContext } from '@/application/utils/apiHandler';

export const POST = withContext(async (req: Request, { params }: { params: Promise<{ sessionId: string }> }) => {
    const { sessionId } = await params;
    const logger = container.get<ILogger>(TYPES.Logger);
    const security = container.get<IEdgeSecurityService>(TYPES.EdgeSecurityService);

    try {
        const auth = await security.getAuthenticatedUser(req);
        if (!auth) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const sessionRepo = container.get<ISessionRepository>(TYPES.SessionRepo);
        const session = await sessionRepo.findById(sessionId);

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.userId !== auth.userId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Prepare text for summarization
        const messagesText = session.messages.map(msg => {
            const content = typeof msg.content === 'string'
                ? msg.content
                : (msg.content as MessagePart[]).filter(p => p.type === 'text').map(p => p.text).join(' ');
            return `${msg.role.toUpperCase()}: ${content}`;
        }).join('\n');

        if (!messagesText.trim()) {
            return NextResponse.json({ summary: 'No history to summarize.' });
        }

        const summarizationService = container.get<ISummarizationService>(TYPES.SummarizationService);
        const summary = await summarizationService.summarize(messagesText);

        return NextResponse.json({ summary });
    } catch (error) {
        logger.error('Failed to generate session summary', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
