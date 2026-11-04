import { NextResponse } from 'next/server';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { ChatService } from '@/application/services/ChatService';
import { ChatRequestSchema, ChatResponseSchema } from '@/application/dtos';
import { validateRequest, validateResponse, createErrorResponse } from '@/application/http/validateRequest';
import { withContext } from '@/application/http/withContext';

export const POST = withContext(async (req: Request) => {
    try {
        const { sessionId, messages } = await validateRequest(req, ChatRequestSchema);

        // Extract the last message content to pass to the service
        // Assuming the user wants to process the latest input
        const lastMessage = messages[messages.length - 1];
        const messageContent = lastMessage?.content || '';

        const chatService = container.get<ChatService>(TYPES.ChatService);

        const reply = await chatService.handleChatInteraction(sessionId, messageContent);

        const responseData = {
            role: 'assistant' as const,
            content: reply,
        };

        const validatedResponse = validateResponse(responseData, ChatResponseSchema);

        return NextResponse.json(validatedResponse);
    } catch (error) {
        return createErrorResponse(error);
    }
});
