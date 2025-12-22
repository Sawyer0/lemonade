import { Dispatch, SetStateAction } from 'react';
import { ApiClient } from '@/infrastructure/api/ApiClient';
import { CONFIG } from '@/infrastructure/config';
import { AppError, ErrorCode } from '@lemonade/core';

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
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'sendMessage function is missing');
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
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');

            if (toolCallId) {
                // Multimodal Function Response (Camera tool)
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
                    const requestOptions = token ? {
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: { sessionId }
                    } : {
                        body: { sessionId }
                    };

                    if (typeof sendMessage === 'function') {
                        await sendMessage({
                            role: 'user',
                            content: [
                                { type: 'text', text: 'I have captured an image of the part.' },
                                { type: 'image', image: publicUrl }
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ] as any
                        }, requestOptions);
                        showToast('Image captured and sent!', 'success');
                    } else {
                        throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'sendMessage function is missing');
                    }
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

