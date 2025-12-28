'use client';
import { useState, useEffect, useRef } from 'react';
import { DiagnosticSession } from '@lemonade/core';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { useTTS } from '@/presentation/hooks/useTTS';
import { useToast } from '@/presentation/context';
import { useGeminiChat, Message } from '@/presentation/hooks/useGeminiChat';
import { CONFIG } from '@/infrastructure/config';
import { Page, Navbar, Link, Block, BlockTitle, Button } from 'konsta/react';

import { SessionStatusHeader } from './SessionStatusHeader';
import { ChatStream } from './ChatStream';
import { AnalysisCard } from './AnalysisCard';
import { InputBar } from './InputBar';
import { useWorkspaceActions } from './useWorkspaceActions';
import { Video, Brain, Loader2 } from 'lucide-react';

interface SessionWorkspaceProps {
    session: DiagnosticSession;
    token: string;
}

export function SessionWorkspace({ session, token }: SessionWorkspaceProps) {

    const initialMessages: Message[] = (session.messages || []).map((m, index) => ({
        id: `${new Date(m.timestamp).getTime()}-${index}`,
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
        timestamp: new Date(m.timestamp).getTime()
    }));

    const chatHelpers = useGeminiChat({
        api: CONFIG.API.ROUTES.CHAT,
        sessionId: session.id,
        token,
        initialMessages
    });

    const { messages, isLoading, currentThoughts, activeToolCalls } = chatHelpers;

    const [input, setInput] = useState('');
    const [voiceMode] = useState(false);
    const { uploadFile, uploading, progress } = useDirectUpload();
    const { showToast } = useToast();
    const { speak } = useTTS();
    const lastSpokenMessageRef = useRef<string | null>(null);

    const isSafetyStop = session.safety_stop;

    const { handleUpload, handleSendMessage, handleImageCapture } = useWorkspaceActions({
        sessionId: session.id,
        uploadFile,
        chatHelpers,
        setInput,
        showToast
    });

    useEffect(() => {
        if (!voiceMode || !messages || messages.length === 0) return;
        const aiMessages = messages.filter(m => m.role === 'assistant');
        if (aiMessages.length === 0) return;

        const latestAiMessage = aiMessages[aiMessages.length - 1];
        const content = typeof latestAiMessage.content === 'string' ? latestAiMessage.content : '';
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
                    messages={messages}
                    isVideoMode={false} // Permanently false in WebView
                    onImageCapture={handleImageCapture}
                    sessionId={session.id}
                    isLoading={isLoading}
                />
            </div>

            {/* Footer / Input */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-black pb-safe">
                {/* Thinking / Tool Call Indicators */}
                <div className="px-4 py-2 space-y-2 bg-black/80 backdrop-blur-sm">
                    {currentThoughts.length > 0 && isLoading && (
                        <div className="flex items-center gap-2 text-xs text-zinc-500 animate-pulse">
                            <Brain size={14} className="text-purple-500" />
                            <span>Thinking: {currentThoughts[currentThoughts.length - 1]}</span>
                        </div>
                    )}
                    {activeToolCalls.map(tool => (
                        <div key={tool.id} className="flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 size={14} className="animate-spin text-blue-500" />
                            <span>Invoking Tool: {tool.name}...</span>
                        </div>
                    ))}
                </div>

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

