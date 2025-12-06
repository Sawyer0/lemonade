import { createVertex } from '@ai-sdk/google-vertex';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { ISessionService } from '@/core/interfaces/ISessionService';
import { ISafetyMonitor } from '@/core/interfaces/ISafetyMonitor';
import { ILogger } from '@/core/interfaces/ILogger';
import { generateSystemPrompt } from '@/core/prompts/chat';
import { CONFIG } from '@/infrastructure/config';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import { ChatRequestSchema } from '@/application/dtos/chat.dto';
import { validateRequest, createErrorResponse } from '@/application/utils/validateRequest';

const CameraToolSchema = z.object({
    reason: z.string().describe('The reason for opening the camera (e.g., "I need to see the tire tread to check for wear").'),
});

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Initialize Vertex AI Provider with Service Account Credentials
const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) {
    throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'FIREBASE_SERVICE_ACCOUNT_KEY is missing');
}
let credentials;
try {
    credentials = JSON.parse(key);
} catch (e) {
    throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, `FIREBASE_SERVICE_ACCOUNT_KEY contains invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
}
const vertex = createVertex({
    project: CONFIG.GCLOUD_PROJECT,
    location: 'us-central1', // Multi-region for Gemini 3 Pro Preview
    googleAuthOptions: {
        credentials
    }
});
export async function POST(req: Request) {
    const logger = container.get<ILogger>(TYPES.Logger);
    try {
        const { messages, sessionId } = await validateRequest(req, ChatRequestSchema);

        const sessionService = container.get<ISessionService>(TYPES.SessionService);
        const safetyMonitor = container.get<ISafetyMonitor>(TYPES.SafetyMonitor);

        let context;
        try {
            context = await sessionService.getSessionContext(sessionId);
        } catch (error) {
            logger.error('Failed to get session context', error);
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, 'Session not found', 404);
        }

        const { vehicle, session } = context;

        // Save the user's message
        const lastMessage = messages[messages.length - 1];
        let latestUserContent = '';
        if (lastMessage && lastMessage.role === 'user') {
            await sessionService.addMessage(sessionId, 'user', lastMessage.content);
            if (typeof lastMessage.content === 'string') {
                latestUserContent = lastMessage.content;
            } else if (Array.isArray(lastMessage.content)) {
                latestUserContent = lastMessage.content
                    .filter((p: unknown) => p && typeof p === 'object' && 'type' in p && (p as { type: string }).type === 'text')
                    .map((p: unknown) => (p as { text: string }).text)
                    .join('\n');
            }
        }

        // Construct system prompt with context
        const systemPrompt = generateSystemPrompt(vehicle, session);

        // 1. Run Safety Monitor Check
        if (latestUserContent) {
            const safetyAssessment = await safetyMonitor.assess(latestUserContent, systemPrompt);

            if (safetyAssessment.intervention_required) {
                // Force a safety intervention response
                logger.warn('SAFETY INTERVENTION TRIGGERED', { hazards: safetyAssessment.hazards_detected });

                const safetyResult = streamText({
                    model: vertex(CONFIG.AI_MODELS.PRIMARY),
                    system: `${systemPrompt}
                    
                    🚨 CRITICAL SAFETY INTERVENTION TRIGGERED 🚨
                    DETECTED HAZARDS: ${JSON.stringify(safetyAssessment.hazards_detected)}
                    
                    YOU MUST NOW EXECUTE THE "PRIME DIRECTIVE" FOR THIS HAZARD as defined in your System Prompt.
                    - IF "LIFE SAFETY" (Going under car): Issue the "Jack Stand Verification" phrase.
                    - IF "HIGH VOLTAGE": Issue the "High Voltage Hard Stop" phrase.
                    - IF "RED ZONE" (Airbag/Fuel): Issue the "Procedure Stop" phrase.
                    
                    DO NOT soften the warning. Be the "Quiet Professional".`,
                    messages: [
                        { role: 'user', content: latestUserContent }
                    ],
                    onFinish: async ({ response }) => {
                        try {
                            // Persist safety intervention message to maintain conversation history
                            const generatedMessages = response.messages;
                            if (generatedMessages && generatedMessages.length > 0) {
                                const lastMessage = generatedMessages[generatedMessages.length - 1];
                                if (lastMessage.content) {
                                    await sessionService.addMessage(sessionId, 'assistant', lastMessage.content);
                                }
                            }
                        } catch (error) {
                            logger.error('Failed to persist safety intervention message', error);
                        }
                    }
                });
                // Return the safety warning immediately with a custom header for the UI
                return safetyResult.toTextStreamResponse({
                    headers: {
                        'X-Safety-Intervention': 'true',
                        'X-Safety-Hazards': JSON.stringify(safetyAssessment.hazards_detected)
                    }
                });
            }
        }


        // Filter out system messages
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let filteredMessages = (messages as any[]).filter(m => m.role !== 'system');

        // Sanitize messages to remove empty content, invalid tool call sequences, and poisoned history
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filteredMessages = filteredMessages.reduce((acc: any[], msg, index, array) => {
            const safeMsg = { ...msg };

            // 0. Pre-Sanitize Content Parts for Semantic Validity
            if (Array.isArray(safeMsg.content)) {
                safeMsg.content = safeMsg.content.map((p: unknown) => {
                    // Safe guard: p must be an object
                    if (!p || typeof p !== 'object') return { type: 'text', text: '[Invalid Part]' };

                    const part = p as { type: string; image?: string };

                    if (part.type === 'image' && typeof part.image === 'string') {
                        // Check if it's actually a video URL
                        // NOTE: Using simple string checks because Regex inside the map loop with complex objects was causing issues
                        const url = part.image.toLowerCase();
                        const isVideo = url.endsWith('.mp4') ||
                            url.endsWith('.mov') ||
                            url.endsWith('.webm') ||
                            url.endsWith('.avi') ||
                            url.endsWith('.mkv') ||
                            url.includes('/video/'); // Path segment check for video routes

                        if (isVideo) {
                            return { type: 'text', text: `[Context: User uploaded a video at ${part.image}]` };
                        }
                    }
                    return p;
                });
            }

            // 1. Sanitize Assistant Messages: Remove 'tool-result' parts if they wrongly appear in assistant role
            // This fixes the "poisoned" DB state from previous bugs
            if (safeMsg.role === 'assistant' && Array.isArray(safeMsg.content)) {
                safeMsg.content = safeMsg.content.filter((p: unknown) => (p as { type: string }).type !== 'tool-result');
            }

            // 2. Skip messages that became empty after sanitization
            const isEmptyString = typeof safeMsg.content === 'string' && safeMsg.content.trim() === '';
            const isEmptyArray = Array.isArray(safeMsg.content) && safeMsg.content.length === 0;

            if (!safeMsg.content || isEmptyString || isEmptyArray) {
                // If it really has no content/parts, drop it
                return acc;
            }

            // 3. Check for dangling tool calls
            // If this is an assistant message with tool calls...
            const hasToolCall = Array.isArray(safeMsg.content) && safeMsg.content.some((p: unknown) => (p as { type: string }).type === 'tool-call');
            if (safeMsg.role === 'assistant' && hasToolCall) {
                // ...it MUST be followed by a tool message
                const nextMsg = array[index + 1];
                if (!nextMsg || nextMsg.role !== 'tool') {
                    logger.warn('Sanitization: Dropping dangling assistant tool-call message', { index });
                    return acc;
                }
            }

            acc.push(safeMsg);
            return acc;
        }, []);

        console.log('DEBUG: streamText sanitized messages. Count:', filteredMessages.length);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.log('DEBUG: streamText messages content:', JSON.stringify(filteredMessages.map((m: any) => {
            if (typeof m.content === 'string') return { role: m.role, content: m.content.substring(0, 50) };
            if (Array.isArray(m.content)) return { role: m.role, parts: m.content.map((p: unknown) => (p as { type: string }).type) };
            return { role: m.role, content: 'UNKNOWN_TYPE' };
        }), null, 2));
        console.log('DEBUG: System Prompt Length:', systemPrompt.length);

        const result = streamText({
            model: vertex(CONFIG.AI_MODELS.PRIMARY),
            messages: filteredMessages,
            system: systemPrompt,
            tools: {
                open_camera: tool({
                    description: 'Open the user camera to capture an image of the vehicle part.',
                    inputSchema: CameraToolSchema,
                }),
            },
            providerOptions: {
                googleVertex: {
                    useSearchGrounding: true,
                },
            },
            toolChoice: 'auto',
            // @ts-expect-error Library type definition missing maxSteps
            maxSteps: 10,
            // Note: validateResponse is not applicable here because we return a text stream, 
            // verifying the stream content happens via unit/integration tests or monitoring.
            onFinish: async ({ response }) => {
                try {
                    // Save assistant message to DB
                    const generatedMessages = response.messages;
                    if (generatedMessages && generatedMessages.length > 0) {
                        const lastMessage = generatedMessages[generatedMessages.length - 1];
                        console.log('DEBUG: onFinish lastMessage:', JSON.stringify(lastMessage, null, 2));

                        // Save full content to persist thought signatures and parts
                        if (lastMessage.content) {
                            // Use actual role from the message (assistant or tool)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            await sessionService.addMessage(sessionId, (lastMessage as any).role || 'assistant', lastMessage.content);
                        }
                    }
                } catch (error) {
                    logger.error('Failed to save assistant message', error);
                    // We don't throw here to avoid breaking the stream response
                }
            }
        });

        return result.toTextStreamResponse();


    } catch (error) {
        return createErrorResponse(error);
    }
}
