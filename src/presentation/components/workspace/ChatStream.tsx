import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from '@/presentation/components/ui/ScrollArea';
import { clsx } from 'clsx';
import { CameraView } from '@/presentation/components/camera/CameraView';
import { FileUploadView } from '@/presentation/components/upload/FileUploadView';
import { ToolMessage } from './ToolMessage';

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
    sessionId?: string;
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

interface ChatStreamProps {
    messages: Message[];
    isVideoMode: boolean;
    onImageCapture: (file: File, toolCallId?: string) => Promise<void>;
    sessionId?: string;
    isLoading?: boolean;
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
        setClosedToolIds(prev => {
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
                    "flex-1 h-full overflow-y-auto p-4 space-y-4 pointer-events-auto min-h-0",
                    !isVideoMode && "bg-zinc-950/50 rounded-xl border border-white/5"
                )}>
                {messages.map((msg) => (
                    <div key={msg.id} className={clsx("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={clsx(
                            "max-w-[80%] p-4 rounded-2xl border pointer-events-auto",
                            // User Message
                            msg.role === 'user' && (isVideoMode
                                ? "bg-blue-600/60 backdrop-blur-md border-white/10 text-white rounded-tr-none"
                                : "bg-blue-600 text-white border-transparent rounded-tr-none"),
                            // AI Message
                            msg.role !== 'user' && (isVideoMode
                                ? "bg-zinc-900/60 backdrop-blur-md border-white/10 text-zinc-200 rounded-tl-none"
                                : "bg-zinc-800 text-zinc-200 border-transparent rounded-tl-none")
                        )}>

                            <div className="text-sm">
                                {Array.isArray(msg.content) ? (
                                    msg.content.map((p: any, i: number) => {
                                        if (p.type === 'text' || (p.text && !p.type)) return <span key={i} className="whitespace-pre-wrap">{p.text}</span>;
                                        if (p.type === 'tool-call' || p.type === 'tool_call') return <ToolMessage key={i} toolName={p.toolName} state="call" isUser={msg.role === 'user'} />;
                                        if (p.type === 'tool-result' || p.type === 'tool_result') return <ToolMessage key={i} toolName={p.toolName} state="result" isUser={msg.role === 'user'} />;
                                        // Fallback for unknown parts to ensure visibility
                                        return <span key={i} className="text-xs text-zinc-500 font-mono mt-1 block">{JSON.stringify(p)}</span>;
                                    })
                                ) : (
                                    typeof msg.content === 'string' && msg.content.startsWith('[') ? (
                                        (() => {
                                            try {
                                                const parsed = JSON.parse(msg.content);
                                                if (Array.isArray(parsed)) {
                                                    return parsed.map((p: any, i: number) => {
                                                        if (p.type === 'text' || (p.text && !p.type)) return <span key={i} className="whitespace-pre-wrap">{p.text}</span>;
                                                        if (p.type === 'tool-call' || p.type === 'tool_call') return <ToolMessage key={i} toolName={p.toolName} state="call" isUser={msg.role === 'user'} />;
                                                        if (p.type === 'tool-result' || p.type === 'tool_result') return <ToolMessage key={i} toolName={p.toolName} state="result" isUser={msg.role === 'user'} />;
                                                        return <span key={i} className="text-xs text-zinc-500 font-mono mt-1 block">{JSON.stringify(p)}</span>;
                                                    });
                                                }
                                                return <span className="whitespace-pre-wrap">{msg.content}</span>;
                                            } catch {
                                                return <span className="whitespace-pre-wrap">{msg.content}</span>;
                                            }
                                        })()
                                    ) : (
                                        <span className="whitespace-pre-wrap">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}</span>
                                    )
                                )}
                            </div>

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
                                                Reason: {String(toolInvocation.args?.reason ?? resultData?.reason ?? 'No reason provided')}
                                            </div>                                    </div>
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </div>
                ))}

                {/* Thinking Indicator */}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <ThinkingBubble />
                )}

                <div ref={bottomRef} />
            </ScrollArea>


            {/* File Upload Button in Footer */}
            {!showFileUpload && sessionId && (
                <div className="border-t border-white/5 p-4">
                    <button
                        onClick={() => setShowFileUpload(true)}
                        className="w-full px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                            />
                        </svg>
                        Upload Video or Audio File
                    </button>
                </div>
            )}
        </>
    );
}
