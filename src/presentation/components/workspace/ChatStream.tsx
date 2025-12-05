import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/presentation/components/ui/ScrollArea';
import { clsx } from 'clsx';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export function ChatStream({ messages, isVideoMode }: { messages: ChatMessage[], isVideoMode: boolean }) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    // Check if user is near bottom before update
    useEffect(() => {
        const scrollContainer = scrollAreaRef.current;
        if (!scrollContainer) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
            setShouldAutoScroll(isNearBottom);
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    // Auto-scroll logic
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        const isUserMessage = lastMessage?.role === 'user';

        if (isUserMessage || shouldAutoScroll) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, shouldAutoScroll]);

    return (
        <ScrollArea
            ref={scrollAreaRef}
            className={clsx(
                "flex-1 h-full p-4 space-y-4 pointer-events-auto min-h-0",
                !isVideoMode && "bg-zinc-950/50 rounded-xl border border-white/5"
            )}>
            {messages.map((msg, idx) => (
                <div key={idx} className={clsx("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx(
                        "max-w-[80%] p-4 rounded-2xl border pointer-events-auto",
                        // User Message
                        msg.role === 'user' && (isVideoMode
                            ? "bg-blue-600/60 backdrop-blur-md border-white/10 text-white"
                            : "bg-blue-600 text-white border-transparent"),
                        // AI Message
                        msg.role !== 'user' && (isVideoMode
                            ? "bg-zinc-900/60 backdrop-blur-md border-white/10 text-zinc-200"
                            : "bg-zinc-800 text-zinc-200 border-transparent")
                    )}>
                        <p className="text-sm">{msg.content}</p>
                    </div>
                </div>
            ))}
            <div ref={bottomRef} />
        </ScrollArea>
    );
}
