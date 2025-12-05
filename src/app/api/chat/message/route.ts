import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { DiagnosticService } from '@/application/services/DiagnosticService';
import { ChatRequestSchema, ChatResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/utils/validateRequest';

export async function POST(req: Request) {
  try {
    const { sessionId, messages } = await validateRequest(req, ChatRequestSchema);

    // Extract the last message content to pass to the service
    // Assuming the user wants to process the latest input
    const lastMessage = messages[messages.length - 1];
    const messageContent = lastMessage?.content || '';

    const diagnosticService = container.get<DiagnosticService>(TYPES.DiagnosticService);

    const reply = await diagnosticService.handleChatInteraction(sessionId, messageContent);

    const responseData = {
      role: 'assistant' as const,
      content: reply
    };

    const validatedResponse = validateResponse(responseData, ChatResponseSchema);

    return NextResponse.json(validatedResponse);

  } catch (error) {
    return createErrorResponse(error);
  }
}
