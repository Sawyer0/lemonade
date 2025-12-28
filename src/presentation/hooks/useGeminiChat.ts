import { useState, useCallback, useRef } from 'react';
import { StreamingEvent, MessagePart } from '@lemonade/core';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'thought' | 'tool';
    content: string | MessagePart[];
    timestamp: number;
}

interface UseGeminiChatOptions {
    api?: string;
    sessionId?: string;
    token?: string;
    initialMessages?: Message[];
    onFinish?: (message: Message) => void;
    onError?: (error: Error) => void;
}

/**
 * Custom hook for interacting with the agentic NDJSON streaming chat API.
 * Replaces Vercel AI SDK's useChat for better integration with our Master Tech agent.
 */
export function useGeminiChat({
    api = '/api/chat',
    sessionId,
    token,
    initialMessages = [],
    onFinish,
    onError
}: UseGeminiChatOptions = {}) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setLocalError] = useState<Error | null>(null);
    
    // For thoughts and tool calls that are transient during streaming
    const [currentThoughts, setCurrentThoughts] = useState<string[]>([]);
    const [activeToolCalls, setActiveToolCalls] = useState<{ name: string, id: string, args: unknown }[]>([]);

    const abortControllerRef = useRef<AbortController | null>(null);

    const append = useCallback(async (message: { role: 'user', content: string | MessagePart[] }) => {
        setIsLoading(true);
        setLocalError(null);
        setCurrentThoughts([]);
        setActiveToolCalls([]);

        const userMessage: Message = {
            id: Math.random().toString(36).substring(7),
            role: 'user',
            content: message.content,
            timestamp: Date.now()
        };

        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const response = await fetch(api, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-id': sessionId || '',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    messages: updatedMessages.map(m => ({ role: m.role, content: m.content }))
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch chat response');
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('Response body is not readable');

            const decoder = new TextDecoder();
            let accumulatedText = '';
            const assistantMessageId = Math.random().toString(36).substring(7);

            // Add placeholder assistant message
            setMessages(prev => [...prev, {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now()
            }]);

            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last partial line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line) as StreamingEvent;
                        
                        switch (event.type) {
                            case 'text':
                                accumulatedText += event.content;
                                setMessages(prev => prev.map(m => 
                                    m.id === assistantMessageId 
                                        ? { ...m, content: accumulatedText } 
                                        : m
                                ));
                                break;
                            case 'thought':
                                setCurrentThoughts(prev => [...prev, event.content]);
                                break;
                            case 'tool_call':
                                setActiveToolCalls(prev => [...prev, { name: event.toolName, id: event.toolCallId, args: event.args }]);
                                break;
                            case 'tool_result':
                                setActiveToolCalls(prev => prev.filter(tc => tc.id !== event.toolCallId));
                                break;
                            case 'error':
                                throw new Error(event.message);
                            case 'done':
                                setIsLoading(false);
                                break;
                        }
                    } catch (e) {
                        console.error('Failed to parse streaming event', e, line);
                    }
                }
            }

            if (onFinish) {
                onFinish({
                    id: assistantMessageId,
                    role: 'assistant',
                    content: accumulatedText,
                    timestamp: Date.now()
                });
            }

        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                console.log('Stream aborted');
            } else {
                const error = err instanceof Error ? err : new Error(String(err));
                setLocalError(error);
                if (onError) onError(error);
            }
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [api, messages, sessionId, token, onFinish, onError]);

    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const reload = useCallback(() => {
        if (messages.length > 0) {
            const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
            if (lastUserMessage) {
                // Remove last assistant message if it exists
                setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages[newMessages.length - 1].role === 'assistant') {
                        newMessages.pop();
                    }
                    return newMessages;
                });
                append({ role: 'user', content: lastUserMessage.content });
            }
        }
    }, [messages, append]);

    return {
        messages,
        setMessages,
        append,
        isLoading,
        stop,
        reload,
        error,
        currentThoughts,
        activeToolCalls
    };
}
