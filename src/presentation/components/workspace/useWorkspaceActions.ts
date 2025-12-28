import { Dispatch, SetStateAction } from 'react';
import { ApiClient } from '@/infrastructure/api/ApiClient';
import { CONFIG } from '@/infrastructure/config';
import { MessagePart } from '@lemonade/core';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'thought' | 'tool';
    content: string | MessagePart[];
    timestamp: number;
}

interface ChatHelpers {
    append: (message: { role: 'user', content: string | MessagePart[] }) => Promise<void>;
    messages: Message[];
    setMessages: Dispatch<SetStateAction<Message[]>>;
}

interface UseWorkspaceActionsProps {
    sessionId: string;
    uploadFile: (file: File, path: string) => Promise<string>;
    chatHelpers: ChatHelpers;
    setInput: Dispatch<SetStateAction<string>>;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const useWorkspaceActions = ({
    sessionId,
    uploadFile,
    chatHelpers,
    setInput,
    showToast,
}: UseWorkspaceActionsProps) => {
    const { append } = chatHelpers;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            try {
                const publicUrl = await uploadFile(file, sessionId);
                // Trigger analysis via API (Fire and Forget)
                await ApiClient.post(CONFIG.API.ROUTES.ANALYSIS_TRIGGER, {
                    sessionId, publicUrl
                });

                showToast('Video uploaded successfully', 'success');
            } catch {
                showToast('Upload failed. Please try again.', 'error');
            }
        }
    };

    const handleSendMessage = async (content: string) => {
        if (!content.trim()) return;

        // Optimistic UI: Clear input immediately
        setInput('');

        try {
            await append({
                role: 'user',
                content
            });

        } catch {
            showToast('Failed to send message. Please try again.', 'error');
            // If failed, restore input
            setInput(content);
        }
    };

    const handleImageCapture = async (file: File, toolCallId?: string) => {
        try {
            const publicUrl = await uploadFile(file, sessionId);
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');

            if (toolCallId) {
                // TODO: Support tool result injection in useGeminiChat if needed
                showToast('Image captured, but tool results are not yet supported in this hook.', 'info');
            } else {
                // File Upload (User initiated - video or audio)
                if (isVideo || isAudio) {
                    // Trigger backend analysis for video/audio
                    await ApiClient.post(CONFIG.API.ROUTES.ANALYSIS_TRIGGER, {
                        sessionId,
                        publicUrl,
                        fileType: isVideo ? 'video' : 'audio'
                    });

                    showToast('File uploaded. AI is analyzing...', 'success');
                } else {
                    // Regular image file
                    await append({
                        role: 'user',
                        content: [
                            { type: 'text', text: 'I have captured an image of the part.' },
                            { type: 'image', image: publicUrl }
                        ]
                    });
                    showToast('Image captured and sent!', 'success');
                }
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to upload file';
            showToast(message, 'error');
        }
    };

    return {
        handleUpload,
        handleSendMessage,
        handleImageCapture
    };
};

