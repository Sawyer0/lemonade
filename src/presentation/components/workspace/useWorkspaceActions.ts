import { Dispatch, SetStateAction } from 'react';
import { CONFIG } from '@/infrastructure/config';

interface ToolInvocation {
    toolName: string;
    toolCallId: string;
    state: 'call' | 'result';
    result?: Record<string, unknown>;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolInvocations?: ToolInvocation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChatHelpers = any;

interface UseWorkspaceActionsProps {
    sessionId: string;
    token: string;
    uploadFile: (file: File, path: string) => Promise<string>;
    chatHelpers: ChatHelpers;
    setInput: Dispatch<SetStateAction<string>>;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const useWorkspaceActions = ({
    sessionId,
    token,
    uploadFile,
    chatHelpers,
    setInput,
    showToast,
}: UseWorkspaceActionsProps) => {
    const { sendMessage, addToolResult } = chatHelpers;

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            try {
                const publicUrl = await uploadFile(file, sessionId);
                // Trigger analysis via API (Fire and Forget)
                const response = await fetch(CONFIG.API.ROUTES.ANALYSIS_TRIGGER, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, publicUrl })
                });

                if (!response.ok) {
                    // Log internally or handle silent failure
                    // Using console for debug in dev, but relying on Toast for user
                    showToast('Analysis trigger failed', 'error');
                } else {
                    showToast('Video uploaded successfully', 'success');
                }
            } catch {
                showToast('Upload failed. Please try again.', 'error');
            }
        }
    };

    const handleSendMessage = async (content: string) => {
        if (!content.trim()) return;

        // Optimistic UI: Clear input immediately
        setInput('');

        const requestOptions = token ? {
            headers: { 'Authorization': `Bearer ${token}` },
            body: { sessionId }
        } : {
            body: { sessionId }
        };

        try {
            if (typeof sendMessage === 'function') {
                await sendMessage({
                    role: 'user',
                    content
                }, requestOptions);
            } else {
                throw new Error('sendMessage function is missing');
            }

        } catch (error) {
            showToast('Failed to send message. Please try again.', 'error');
            // If failed, restore input
            setInput(content);
            throw error;
        }
    };

    const handleImageCapture = async (file: File, toolCallId?: string) => {
        try {
            const publicUrl = await uploadFile(file, sessionId);

            if (toolCallId) {
                // Multimodal Function Response
                addToolResult({
                    toolCallId,
                    result: {
                        response: {
                            success: true,
                            image_output: { "$ref": "captured_image" }
                        },
                        parts: [
                            {
                                displayName: "captured_image",
                                fileData: {
                                    mimeType: file.type,
                                    fileUri: publicUrl
                                }
                            }
                        ]
                    }
                });

                showToast('Image sent to AI analysis!', 'success');
            } else {
                // Manual Capture (User initiated)
                const requestOptions = token ? {
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: { sessionId }
                } : {
                    body: { sessionId }
                };

                await sendMessage({
                    role: 'user',
                    content: [
                        { type: 'text', text: 'I have captured an image of the part.' },
                        { type: 'image', image: publicUrl }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ] as any
                }, requestOptions);
                showToast('Image captured and sent!', 'success');
            }

        } catch (error) {
            showToast('Failed to send image.', 'error');
        }
    };

    return {
        handleUpload,
        handleSendMessage,
        handleImageCapture
    };
};
