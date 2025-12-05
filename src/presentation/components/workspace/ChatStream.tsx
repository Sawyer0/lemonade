import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/presentation/components/ui/ScrollArea';
import { clsx } from 'clsx';
import { CameraView } from '@/presentation/components/camera/CameraView';

interface ToolInvocation {
    toolName: string;
    toolCallId: string;
    state: 'call' | 'result';
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any;
    toolInvocations?: ToolInvocation[];
}

interface ChatStreamProps {
    messages: Message[];
    isVideoMode: boolean;
    onImageCapture: (file: File, toolCallId?: string) => Promise<void>;
}

export function ChatStream({ messages, isVideoMode, onImageCapture }: ChatStreamProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    const [closedToolIds, setClosedToolIds] = useState<Set<string>>(new Set());

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

    const handleCloseTool = (toolCallId: string) => {
        setClosedToolIds(prev => {
            const next = new Set(prev);
            next.add(toolCallId);
            return next;
        });
    };

    return (
        <ScrollArea
            ref={scrollAreaRef}
            className={clsx(
                "flex-1 h-full p-4 space-y-4 pointer-events-auto min-h-0",
                !isVideoMode && "bg-zinc-950/50 rounded-xl border border-white/5"
            )}>
            {messages.map((msg) => (
                <div key={msg.id} className={clsx("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
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

                        <p className="text-sm whitespace-pre-wrap">
                            {(() => {
                                try {
                                    // Handle Array Content (Multimodal/Native)
                                    if (Array.isArray(msg.content)) {
                                        return msg.content
                                            .filter((p: unknown) => typeof p === 'object' && p !== null && 'type' in p && (p as { type: string }).type === 'text' && 'text' in p)
                                            .map((p: unknown) => (p as { text: string }).text)
                                            .join('');
                                    }

                                    // Handle simplified JSON strings (Legacy/Fallback)
                                    if (typeof msg.content === 'string' && msg.content.startsWith('[') && msg.content.includes('"type":"text"')) {
                                        const parsed = JSON.parse(msg.content);
                                        if (Array.isArray(parsed)) {
                                            return parsed
                                                .filter((p: unknown) => typeof p === 'object' && p !== null && 'text' in p)
                                                .map((p: unknown) => (p as { text: string }).text)
                                                .join('');
                                        }
                                    }

                                    return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                                } catch {
                                    return String(msg.content);
                                }
                            })()}
                        </p>

                        {/* Tool Invocations */}
                        {msg.toolInvocations?.map((toolInvocation) => {
                            const { toolName, toolCallId, state, result } = toolInvocation;

                            // Handle both CALL (Client Action) and RESULT (Completed) states
                            // We show the camera for "call" state (needs action) or "result" state (if we want to show it happened, but here we likely only care about acting or history)
                            if (toolName === 'open_camera') {
                                const resultData = result as Record<string, unknown> | undefined;
                                const isClosed = closedToolIds.has(toolCallId); // || state === 'result' (optional: hide if done)

                                if (isClosed || state === 'result') {
                                    return (
                                        <div key={toolCallId} className="mt-2 p-2 bg-black/50 rounded-lg border border-white/10">
                                            <div className="flex items-center gap-2 text-zinc-400 text-sm font-mono">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span>Image Captured</span>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={toolCallId} className="mt-4">
                                        <CameraView
                                            onCapture={async (file) => {
                                                await onImageCapture(file, toolCallId);
                                                handleCloseTool(toolCallId);
                                            }}
                                            onClose={() => handleCloseTool(toolCallId)}
                                        />
                                        <div className="mt-2 text-xs text-zinc-400 font-mono">
                                            {/* For 'call' state, args are in toolInvocation.args, not result */}
                                            {/* We can display the reason if it sits in args */}
                                            Reason: {(toolInvocation.args?.reason as string) || (resultData?.reason as string) || 'No reason provided'}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>
                </div>
            ))}
            <div ref={bottomRef} />
        </ScrollArea>
    );
}
