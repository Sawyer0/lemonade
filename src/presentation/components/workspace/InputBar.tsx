import React, { useRef } from 'react';
import { Messagebar, Link } from 'konsta/react';
import { Paperclip, Send, Loader2 } from 'lucide-react';

import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { ILogger } from '@lemonade/core';

interface InputBarProps {
    input: string;
    setInput: (value: string) => void;
    onSendMessage: (message: string) => Promise<void>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    uploading: boolean;
    progress: number;
}

export function InputBar({ input, setInput, onSendMessage, onUpload, uploading, progress }: InputBarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = async () => {
        if (input.trim()) {
            try {
                const messageToSend = input;
                // Optimistic clear could be done, but safer to wait for success or error handling
                // Original code waited for promise.
                // However, for chat UX, clearing immediately is often better, but let's stick to original logic if unsure
                // or better: await it, then clear.
                await onSendMessage(messageToSend);
                setInput('');
            } catch (error) {
                const logger = clientContainer.get<ILogger>(TYPES.Logger);
                logger.error('Failed to send message:', error);
                // Keep input so user can retry
            }
        }
    };

    return (
        <div className="w-full pb-safe">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="video/*,audio/*,image/*"
                onChange={onUpload}
            />

            <Messagebar
                placeholder="Ask Master Tech..."
                value={input}
                onInput={(e) => setInput(e.target.value)}

                // Left Side: Attachment Button
                left={
                    <Link
                        className="!text-zinc-400"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {uploading ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                <span className="text-[10px] font-mono">{Math.round(progress)}%</span>
                            </div>
                        ) : (
                            <Paperclip className="w-6 h-6" />
                        )}
                    </Link>
                }

                // Right Side: Send Button
                right={
                    <Link
                        className={`${input.trim() ? '!text-blue-500' : '!text-zinc-600'} ${!input.trim() ? 'pointer-events-none opacity-50' : ''}`}
                        onClick={handleSend}
                    >
                        <Send className="w-6 h-6" />
                    </Link>
                }

                // Native Styling Overrides if needed, typically Messagebar handles this well
                className="!bg-zinc-900/90 !backdrop-blur-md !border-t !border-white/10"
            />
        </div>
    );
}

