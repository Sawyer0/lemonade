import { Message as KonstaMessage } from 'konsta/react';
import { CameraView } from '@/presentation/components/camera/CameraView';
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
    content: unknown;
    toolInvocations?: ToolInvocation[];
}

interface ChatMessageProps {
    msg: Message;
    isVideoMode: boolean;
    onImageCapture: (file: File, toolCallId?: string) => Promise<void>;
    handleCloseTool: (toolCallId: string) => void;
    closedToolIds: Set<string>;
}

export function ChatMessage({ msg, isVideoMode, onImageCapture, handleCloseTool, closedToolIds }: ChatMessageProps) {
    const isUser = msg.role === 'user';

    // Helper to render content parts
    const renderContent = () => {
        if (Array.isArray(msg.content)) {
            return msg.content.map((p: any, i: number) => {
                if (p.type === 'text' || (p.text && !p.type)) return <span key={i} className="whitespace-pre-wrap block mb-2 last:mb-0">{p.text}</span>;
                if (p.type === 'tool-call' || p.type === 'tool_call') return <ToolMessage key={i} toolName={p.toolName!} state="call" isUser={isUser} />;
                if (p.type === 'tool-result' || p.type === 'tool_result') return <ToolMessage key={i} toolName={p.toolName!} state="result" isUser={isUser} />;
                return null;
            });
        }
        
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        
        // Attempt to parse if it looks like a JSON array string
        if (contentStr.startsWith('[')) {
             try {
                const parsed = JSON.parse(contentStr);
                if (Array.isArray(parsed)) {
                     return parsed.map((p: any, i: number) => {
                        if (p.type === 'text' || (p.text && !p.type)) return <span key={i} className="whitespace-pre-wrap block mb-2 last:mb-0">{p.text}</span>;
                        return null; 
                     });
                }
             } catch {}
        }
        
        return <span className="whitespace-pre-wrap">{contentStr}</span>;
    };

    return (
        <div className="mb-4">
            <KonstaMessage
                type={isUser ? 'sent' : 'received'}
                // Use Konsta's native bubble styling props
                colors={{
                    bubbleSentMd: 'bg-blue-600',
                    bubbleReceivedMd: isVideoMode ? 'bg-zinc-900/60 backdrop-blur-md border border-white/10' : 'bg-zinc-800',
                }}
                text={
                    <div className="text-sm">
                        {renderContent()}
                        
                        {/* Tool Invocations rendered INSIDE the bubble if needed, or outside? 
                            Usually tools like Camera are better outside or distinct. 
                            Let's keep them inside for context grouping, or move specific interactive ones out.
                        */}
                    </div>
                }
            />

            {/* Interactive Tools (Camera) - Rendered OUTSIDE the bubble for full width/focus */}
            {msg.toolInvocations?.map((toolInvocation) => {
                const { toolName, toolCallId, state, result } = toolInvocation;

                if (toolName === 'openCamera') {
                    const resultData = result as Record<string, unknown> | undefined;
                    const isClosed = closedToolIds.has(toolCallId);

                    if (isClosed || state === 'result') {
                        return (
                            <div key={toolCallId} className="mx-4 mt-2 p-3 bg-zinc-900 rounded-xl border border-white/10 flex items-center gap-3">
                                <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <span className="text-zinc-400 text-sm font-medium">Image Captured</span>
                            </div>
                        );
                    }

                    return (
                        <div key={toolCallId} className="mx-2 mt-2 overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                            <CameraView
                                onCapture={async (file) => {
                                    await onImageCapture(file, toolCallId);
                                    handleCloseTool(toolCallId);
                                }}
                                onClose={() => handleCloseTool(toolCallId)}
                            />
                            <div className="bg-zinc-900 p-2 text-center">
                                <p className="text-xs text-zinc-500 font-mono">
                                    Request: {String(toolInvocation.args?.reason ?? resultData?.reason ?? 'No reason provided')}
                                </p>
                            </div>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
}
