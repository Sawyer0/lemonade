import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { IDiagnosticService } from '@/core/interfaces/IDiagnosticService';
import { generateSystemPrompt } from '@/core/prompts/chat';
import { CONFIG } from '@/infrastructure/config';

export const maxDuration = CONFIG.API.TIMEOUT / 1000;

export async function POST(req: Request) {
    const { messages, sessionId } = await req.json();

    const diagnosticService = container.get<IDiagnosticService>(TYPES.DiagnosticService);
    const { vehicle, session } = await diagnosticService.getSessionContext(sessionId);

    // Save the user's message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
        await diagnosticService.addMessage(sessionId, 'user', lastMessage.content);
    }

    // Construct system prompt with context
    const systemPrompt = generateSystemPrompt(vehicle, session);

    const result = streamText({
        model: google(CONFIG.AI_MODELS.PRIMARY),
        messages,
        system: systemPrompt,
        tools: {
            // Web Search Grounding (SDK v5 pattern)
            // Enables real-time web search for TSBs, recalls, repair procedures, torque specs
            webSearch: google.tools.googleSearch({
                mode: 'MODE_DYNAMIC',
                dynamicThreshold: 0.3,
            }),
        },
        toolChoice: 'auto',
        onFinish: async ({ response }) => {
            // Save assistant message to DB
            const generatedMessages = response.messages;
            if (generatedMessages && generatedMessages.length > 0) {
                const lastMessage = generatedMessages[generatedMessages.length - 1];
                await diagnosticService.addMessage(sessionId, 'assistant', lastMessage.content as string);
            }
        }
    });

    return result.toTextStreamResponse();
}
