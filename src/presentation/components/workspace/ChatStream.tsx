import React from 'react';
import { clsx } from 'clsx';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatStreamProps {
    messages: ChatMessage[];
}

export function ChatStream({ messages }: ChatStreamProps) {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 mask-image-gradient">
            {messages.map((msg, idx) => (
                <div key={idx} className={clsx("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx(
                        "max-w-[80%] p-4 rounded-2xl backdrop-blur-md border border-white/10 pointer-events-auto",
                        msg.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-zinc-900/80 text-zinc-200'
                    )}>
                        <p className="text-sm">{msg.content}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
