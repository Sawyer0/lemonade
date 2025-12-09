import { useState } from 'react';
import { auth } from '@mobile/infrastructure/firebase/config';

interface UseMobileChatResult {
    sendMessage: (text: string) => Promise<void>;
    sending: boolean;
    error: string | null;
}

export function useMobileChat(sessionId: string): UseMobileChatResult {
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = async (text: string) => {
        if (!text.trim()) return;
        setSending(true);
        setError(null);

        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (!API_URL) throw new Error("API_URL is not defined");

            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Add auth token if your API requires it (it likely does via middleware)
                    // 'Authorization': `Bearer ${await auth.currentUser?.getIdToken()}` 
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

            // We ignore the stream response here and rely on useLiveSession (Firestore)
            // to update the UI with the assistant's response.
            
        } catch (err: any) {
            console.error("Chat Send Error:", err);
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    return { sendMessage, sending, error };
}
