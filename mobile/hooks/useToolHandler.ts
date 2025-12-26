import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { DiagnosticSession, MessagePart } from '@lemonade/core';

export function useToolHandler(session: DiagnosticSession | null) {
    const router = useRouter();
    const { user } = useAuth();
    const lastHandledMessageId = useRef<string | null>(null);

    useEffect(() => {
        if (!session?.messages?.length) return;

        const lastMessage = session.messages[session.messages.length - 1];

        // Prevent duplicate handling
        const msgId = lastMessage.timestamp.toString(); 
        if (lastHandledMessageId.current === msgId) return;

        // Only react to assistant messages that might contain tool calls
        if (lastMessage.role === 'assistant' && Array.isArray(lastMessage.content)) {
            const toolCalls = (lastMessage.content as MessagePart[]).filter(p => p.type === 'tool-call');

            for (const toolCall of toolCalls) {
                if (!toolCall.toolName) continue;

                if (toolCall.toolName === 'start_video_stream' || toolCall.toolName === 'verify_safe_support') {
                    // Both require live camera access
                    if (user?.preferences?.autoOpenCamera) {
                        console.log(`[Auto-Tool] Opening camera for ${toolCall.toolName}`);
                        lastHandledMessageId.current = msgId;
                        router.push(`/live-mechanic?roomName=${session.id}&sessionId=${session.id}&tool=${toolCall.toolName}`);
                    }
                } else if (toolCall.toolName === 'display_content') {
                    const args = toolCall.args as Record<string, unknown>;
                    if (args?.url && typeof args.url === 'string') {
                        console.log(`[Tool] Displaying content: ${args.title}`);
                        lastHandledMessageId.current = msgId;
                        router.push(`/modal?url=${encodeURIComponent(args.url)}&title=${encodeURIComponent((args.title as string) || 'Documentation')}`);
                    }
                }
            }
        }
    }, [session?.messages, user?.preferences?.autoOpenCamera, router, session?.id]);
}
