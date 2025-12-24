import { useState, useEffect } from 'react';
import { auth, db } from '@mobile/infrastructure/firebase/config';
import { doc, onSnapshot, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | any[];
    timestamp: Date;
}

interface UseMobileChatResult {
    messages: ChatMessage[];
    sendMessage: (content: string | any[]) => Promise<void>;
    sendMedia: (uri: string, gsUri: string, mimeType: string, text?: string) => Promise<void>;
    getResumeSummary: () => Promise<string>;
    sending: boolean;
    streamingMessage: string | null;
    error: string | null;
}

/**
 * Hook for managing chat interactions with Firestore persistence and AI streaming.
 */
export function useMobileChat(sessionId: string): UseMobileChatResult {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sending, setSending] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    // Subscribe to Firestore for real-time history
    useEffect(() => {
        if (!sessionId) return;

        const sessionRef = doc(db, 'sessions', sessionId);
        const unsubscribe = onSnapshot(sessionRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.messages && Array.isArray(data.messages)) {
                    const loadedMessages = data.messages.map((msg: any) => ({
                        ...msg,
                        timestamp: msg.timestamp instanceof Timestamp ? msg.timestamp.toDate() : new Date(msg.timestamp)
                    }));
                    setMessages(loadedMessages);
                }
            }
        }, (err) => {
            console.error("Firestore subscription error:", err);
            setError("Failed to load chat history");
        });

        return () => unsubscribe();
    }, [sessionId]);

    const sendMessage = async (content: string | any[]) => {
        const isText = typeof content === 'string';
        if (isText && !content.trim()) return;
        
        setSending(true);
        setError(null);
        setStreamingMessage(""); 

        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (!API_URL) throw new Error("API_URL is not defined");

            const user = auth.currentUser;
            if (!user) throw new Error("User must be authenticated");
            
            const token = await user.getIdToken();

            // 1. Optimistic/Persistent update to Firestore
            const userMsg = {
                role: 'user',
                content: content,
                timestamp: new Date()
            };
            
            await updateDoc(doc(db, 'sessions', sessionId), {
                messages: arrayUnion(userMsg)
            });

            // 2. Call AI Streaming API
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessionId,
                    messages: [{ role: 'user', content: content }]
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to send message');
            }

            // 3. Consume Stream
            const reader = response.body?.getReader();
            if (!reader) throw new Error("No readable stream");

            const decoder = new TextDecoder();
            let accumulated = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;
                setStreamingMessage(accumulated);
            }

            setStreamingMessage(null);

        } catch (err: any) {
            console.error("Chat Error:", err);
            setError(err.message || "An unknown error occurred");
            setStreamingMessage(null);
        } finally {
            setSending(false);
        }
    };

    /**
     * Specialized helper for sending media (images/videos)
     * Follows Vertex AI best practices for fileData.
     */
    const sendMedia = async (uri: string, gsUri: string, mimeType: string, text?: string) => {
        const parts: any[] = [];
        
        if (text) {
            parts.push({ type: 'text', text });
        }

        // Add both visual URL (for UI) and GS URI (for AI)
        parts.push({
            type: 'image', // For UI rendering
            image: uri 
        });

        parts.push({
            type: 'fileData', // For Vertex AI processing
            fileData: {
                fileUri: gsUri,
                mimeType: mimeType
            }
        });

        return sendMessage(parts);
    };

    const getResumeSummary = async (): Promise<string> => {
        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            const token = await auth.currentUser?.getIdToken();
            const response = await fetch(`${API_URL}/api/sessions/${sessionId}/summarize`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Failed to summarize');
            const data = await response.json();
            return data.summary;
        } catch (err) {
            console.error(err);
            return "Unable to generate summary.";
        }
    };

    return { messages, sendMessage, sendMedia, getResumeSummary, sending, streamingMessage, error };
}