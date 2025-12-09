import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/UserContext';
import { DiagnosticSession } from '@core/types/models';

export function useToolHandler(session: DiagnosticSession | null) {
    const router = useRouter();
    const { user } = useAuth();
    const lastHandledMessageId = useRef<string | null>(null);

    useEffect(() => {
        if (!session?.messages?.length) return;

        const lastMessage = session.messages[session.messages.length - 1];

        // Prevent duplicate handling
        const msgId = lastMessage.timestamp.toString(); // Simple ID proxy if no uuid on message
        if (lastHandledMessageId.current === msgId) return;

        // Only react to assistant messages that might contain tool calls
        if (lastMessage.role === 'assistant' && Array.isArray(lastMessage.content)) {
            const toolCall = lastMessage.content.find(p => p.type === 'tool-call');

            if (toolCall && toolCall.toolName === 'openCamera') {
                // Check if we should auto-open based on user preference
                if (user?.preferences?.autoOpenCamera) {
                    console.log("[Auto-Tool] Auto-opening camera based on preference");
                    lastHandledMessageId.current = msgId;
                    router.push(`/live-mechanic?roomName=${session.id}&sessionId=${session.id}`);
                }
            }
        }
    }, [session?.messages, user?.preferences?.autoOpenCamera]);
}
