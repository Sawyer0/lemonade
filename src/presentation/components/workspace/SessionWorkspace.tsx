'use client';
import { useState, useEffect, useRef } from 'react';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { useTTS } from '@/presentation/hooks/useTTS';
import { useToast } from '@/presentation/context';
import { useChat } from '@ai-sdk/react';
import { CONFIG } from '@/infrastructure/config';
import { Page, Navbar, Link, Block, BlockTitle, Button } from 'konsta/react';

import { SessionStatusHeader } from './SessionStatusHeader';
import { ChatStream } from './ChatStream';
import { AnalysisCard } from './AnalysisCard';
import { InputBar } from './InputBar';
import { useWorkspaceActions, Message } from './useWorkspaceActions';
import { Video } from 'lucide-react';

interface SessionWorkspaceProps {
    session: DiagnosticSession;
    token: string;
}

export function SessionWorkspace({ session, token }: SessionWorkspaceProps) {

    // useChat v5: Input state is managed manually.
    const chatResult = useChat({
        api: CONFIG.API.ROUTES.CHAT,
        body: { sessionId: session.id },
        headers: {
            'Authorization': `Bearer ${token}`
        },
        messages: (session.messages || []).map((m: Record<string, unknown>, index: number) => ({
            id: `${(m.timestamp as Date).getTime()}-${index}`,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        })) as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatHelpers = chatResult as any;
    const { messages, setMessages, isLoading } = chatHelpers;

    // Fallback: Manually set messages if useChat didn't initialize correctly
    useEffect(() => {
        if (!session.messages) return;
        if (session.messages.length > messages.length) {
            const convertedMessages = session.messages.map((m: Record<string, unknown>, index: number) => ({
                id: `${(m.timestamp as Date).getTime()}-${index}`,
                role: m.role as 'user' | 'assistant' | 'system',
                content: m.content
            }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setMessages(convertedMessages as any);
        }
    }, [session.messages, messages.length, setMessages]);

    const [input, setInput] = useState('');
    const [voiceMode] = useState(false);
    const { uploadFile, uploading, progress } = useDirectUpload();
    const { showToast } = useToast();
    const { speak } = useTTS();
    const lastSpokenMessageRef = useRef<string | null>(null);

    const isSafetyStop = session.safety_stop;

    const { handleUpload, handleSendMessage, handleImageCapture } = useWorkspaceActions({
        sessionId: session.id,
        token,
        uploadFile,
        chatHelpers,
        setInput,
        showToast
    });

    useEffect(() => {
        if (!voiceMode || !messages || messages.length === 0) return;
        const aiMessages = (messages as Message[]).filter((m: Message) => m.role === 'assistant');
        if (aiMessages.length === 0) return;

        const latestAiMessage = aiMessages[aiMessages.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content = (latestAiMessage as any).content;
        if (content && content !== lastSpokenMessageRef.current) {
            lastSpokenMessageRef.current = content;
            speak(content);
        }
    }, [messages, voiceMode, speak]);

    const handleGoLive = () => {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'JOIN_LIVE_SESSION' }));
        } else {
            showToast('Live Mode is only available in the Mobile App', 'info');
        }
    };

    return (
        <Page className="bg-black">
            <Navbar
                title="Diagnostic Session"
                className="top-0 sticky z-50"
                right={
                    <Link onClick={handleGoLive} className="flex gap-2 items-center text-red-500">
                        <Video size={20} />
                        Live
                    </Link>
                }
            />

            {/* Safety Banner Block */}
            {isSafetyStop && (
                <Block className="bg-red-900/50 border border-red-500 rounded-lg m-4 p-4 animate-pulse">
                    <BlockTitle className="text-red-500 font-bold mb-2">SAFETY STOP ACTIVE</BlockTitle>
                    <p className="text-white text-sm mb-4">
                        {session.safety_reason || "Hazard detected. Verification required."}
                    </p>
                    <Button onClick={handleGoLive} className="bg-red-600 w-full">
                        Open Camera to Verify
                    </Button>
                </Block>
            )}

            {/* Session Status */}
            <SessionStatusHeader
                sessionId={session.id}
                vehicleId={session.vehicleId}
                status={session.status}
            />

            {/* Chat Area */}
            <div className="flex-1 min-h-0 relative flex flex-col h-[calc(100vh-200px)]">
                <ChatStream
                    messages={messages as unknown as Message[]}
                    isVideoMode={false} // Permanently false in WebView
                    onImageCapture={handleImageCapture}
                    sessionId={session.id}
                    isLoading={isLoading}
                />
            </div>

            {/* Footer / Input */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-black pb-safe">
                <AnalysisCard
                    analysis={session.aiAnalysis}
                    isSafetyStop={isSafetyStop}
                />

                <InputBar
                    input={input}
                    setInput={setInput}
                    onSendMessage={handleSendMessage}
                    onUpload={handleUpload}
                    uploading={uploading}
                    progress={progress}
                />
            </div>
        </Page>
    );
}
