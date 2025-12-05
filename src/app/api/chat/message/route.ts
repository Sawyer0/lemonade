import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticService } from '@/application/services/DiagnosticService';
import { ILogger } from '@/core/interfaces/ILogger';
import { ChatRequestSchema } from '@/application/dtos';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionId, message } = ChatRequestSchema.parse(body);

    const diagnosticService = container.get<DiagnosticService>(TYPES.DiagnosticService);
    const reply = await diagnosticService.handleChatInteraction(sessionId, message);

    return NextResponse.json({
      role: 'assistant',
      content: reply
    });

  } catch (error) {
    const logger = container.get<ILogger>(TYPES.Logger);
    logger.error('AI Service Unavailable', error);
    return NextResponse.json({ error: 'AI Service Unavailable' }, { status: 503 });
  }
}
