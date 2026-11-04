import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/presentation/components/ui/ScrollArea';
import { clsx } from 'clsx';
import { FileUploadView } from '@/presentation/components/upload/FileUploadView';
import { ChatMessage } from './ChatMessage';
import { ChatFooterInput } from './ChatFooterInput';

interface ToolInvocation {
    toolName: string;
    toolCallId: string;
    state: 'call' | 'result';
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'thought' | 'tool';
    content: unknown;
    toolInvocations?: ToolInvocation[];
}

interface ChatStreamProps {
    messages: Message[];
    isVideoMode: boolean;
    onImageCapture: (file: File, toolCallId?: string) => Promise<void>;
    sessionId?: string;
    isLoading?: boolean;
}

// Simple pulsing indicator for AI "thought" process
function ThinkingBubble() {
    return (
        <div className="flex justify-start animate-pulse">
            <div className="bg-zinc-800/80 backdrop-blur-sm text-zinc-400 rounded-2xl rounded-tl-none p-4 border border-zinc-700/50 shadow-sm flex items-center gap-3">
                <div className="flex gap-1 items-center h-2">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></span>
                </div>
                <span className="text-xs font-medium text-zinc-400">Processing...</span>
            </div>
        </div>
    );
}

export function ChatStream({ messages, isVideoMode, onImageCapture, sessionId, isLoading }: ChatStreamProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [closedToolIds, setClosedToolIds] = useState<Set<string>>(new Set());
    const [showFileUpload, setShowFileUpload] = useState(false);

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

    // Auto-scroll logic (updated to include isLoading trigger)
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        const isUserMessage = lastMessage?.role === 'user';

        if (isUserMessage || shouldAutoScroll || isLoading) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, shouldAutoScroll, isLoading]);

    const handleCloseTool = (toolCallId: string) => {
        setClosedToolIds((prev) => {
            const next = new Set(prev);
            next.add(toolCallId);
            return next;
        });
    };

    return (
        <>
            {/* File Upload Overlay */}
            {showFileUpload && sessionId && (
                <div className="absolute inset-0 flex items-end p-4 z-50">
                    <div className="w-full max-w-2xl">
                        <FileUploadView
                            onUpload={async (file) => {
                                // Call the same image capture flow for consistency
                                await onImageCapture(file);
                                setShowFileUpload(false);
                            }}
                            onClose={() => setShowFileUpload(false)}
                        />
                    </div>
                </div>
            )}

            <ScrollArea
                ref={scrollAreaRef}
                className={clsx(
                    'flex-1 h-full overflow-y-auto p-4 space-y-4 pointer-events-auto min-h-0',
                    !isVideoMode && 'bg-zinc-950/50 rounded-xl border border-white/5',
                )}
            >
                {messages.map((msg) => (
                    <ChatMessage
                        key={msg.id}
                        msg={msg}
                        isVideoMode={isVideoMode}
                        onImageCapture={onImageCapture}
                        handleCloseTool={handleCloseTool}
                        closedToolIds={closedToolIds}
                    />
                ))}

                {/* Thinking Indicator */}
                {isLoading && messages[messages.length - 1]?.role === 'user' && <ThinkingBubble />}

                <div ref={bottomRef} />
            </ScrollArea>

            {/* File Upload Button in Footer */}
            <ChatFooterInput sessionId={sessionId} setShowFileUpload={setShowFileUpload} />
        </>
    );
}
