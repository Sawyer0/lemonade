import { useState } from 'react';
import { auth } from '@mobile/infrastructure/firebase/config';

// Define the shape of the message content expected from the stream
interface StreamedMessagePart {
    type: 'text'; // Assuming text chunks for now
    content: string;
}

interface UseMobileChatResult {
    sendMessage: (text: string) => Promise<void>;
    sending: boolean;
    error: string | null;
}

// Modify the hook to accept callbacks for stream updates
export function useMobileChat(
    sessionId: string,
    onStreamUpdate: (messagePart: StreamedMessagePart) => void,
    onStreamComplete: (fullMessage: string) => void,
    onStreamError: (error: Error) => void
): UseMobileChatResult {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;
        setSending(true);
        setError(null);

        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (!API_URL) throw new Error("API_URL is not defined");

            const user = auth.currentUser;
            if (!user) {
                throw new Error("User must be authenticated to send messages");
            }
            const token = await user.getIdToken();

            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    messages: [
                        { role: 'user', content: text }
                    ]
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to send message');
            }

            // --- Consume the stream response ---
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Failed to get readable stream from response.");
            }

            let accumulatedMessage = '';
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                accumulatedMessage += chunk;

                // Call the stream update callback for progressive UI updates
                onStreamUpdate({ type: 'text', content: chunk });
            }

            onStreamComplete(accumulatedMessage); // Notify when the full message is received

        } catch (err: unknown) {
            console.error("Chat Send Error:", err);
            const caughtError = err instanceof Error ? err : new Error(String(err));
            setError(caughtError.message);
            onStreamError(caughtError); // Notify on error
        } finally {
            setSending(false);
        }
    };

    return { sendMessage, sending, error };
}