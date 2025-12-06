'use client';
import { useState, useEffect, useRef } from 'react';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { useVoiceCommand } from '@/presentation/hooks/useVoiceCommand';
import { useTTS } from '@/presentation/hooks/useTTS';
import { useToast } from '@/presentation/context';
import { useChat } from '@ai-sdk/react';
import { CONFIG } from '@/infrastructure/config';

import { SafetyOverlay } from './SafetyOverlay';
import { SessionStatusHeader } from './SessionStatusHeader';
import { ChatStream } from './ChatStream';
import { AnalysisCard } from './AnalysisCard';
import { InputBar } from './InputBar';
import { VideoViewport } from './VideoViewport';
import { useWorkspaceActions, Message } from './useWorkspaceActions';

interface CameraWorkspaceProps {
    session: DiagnosticSession;
    token: string;
}

export function CameraWorkspace({ session, token }: CameraWorkspaceProps) {

    // useChat v5: Input state is managed manually.
    const chatResult = useChat({
        api: CONFIG.API.ROUTES.CHAT,
        body: { sessionId: session.id },
        headers: {
            'Authorization': `Bearer ${token}`
        },
        messages: session.messages.map((m: Record<string, unknown>, index: number) => ({
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
    // Sync: Keep chat state in sync with Firestore (Real-time Fallback)
    useEffect(() => {
        if (!session.messages) return;
        // Only update if we are "behind" the server state
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

    useEffect(() => {
        console.log('DEBUG: CameraWorkspace messages:', JSON.stringify(messages, null, 2));
    }, [messages]);

    const [input, setInput] = useState('');
    const [voiceMode] = useState(false);
    const { uploadFile, uploading, progress } = useDirectUpload();
    const { processAudio, isProcessing: isProcessingAudio } = useVoiceCommand();
    const { showToast } = useToast();
    const { speak, stop, isSpeaking } = useTTS();
    const lastSpokenMessageRef = useRef<string | null>(null);

    const isSafetyStop = session.safety_stop; // Use top-level field

    // Extract Actions
    const { handleUpload, handleSendMessage, handleImageCapture } = useWorkspaceActions({
        sessionId: session.id,
        token,
        uploadFile,
        chatHelpers,
        setInput,
        showToast
    });

    // Auto-speak AI messages when in Voice Mode
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

    // Stop speaking when user starts talking (barge-in)
    useEffect(() => {
        if (isProcessingAudio && isSpeaking) {
            stop();
        }
    }, [isProcessingAudio, isSpeaking, stop]);

    const handleAudioDetected = async (audioData: Float32Array) => {
        await processAudio(audioData, session.id);
    };

    return (
        <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">
            {/* LAYER 1: VIEWPORT (Video/Camera) */}
            <VideoViewport videoUrl={session.videoUrl} />

            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

            {/* LAYER 2: SAFETY OVERLAY (Red Zone) */}
            <SafetyOverlay
                active={session.safety_stop}
                reason={session.safety_reason}
                onAcknowledge={() => showToast('Safety Protocol Acknowledged', 'success')}
            />

            {/* LAYER 3: HUD (Heads Up Display) */}
            <div className="relative z-10 flex-1 flex flex-col justify-between p-4 pointer-events-none">

                {/* Top Bar */}
                <SessionStatusHeader
                    sessionId={session.id}
                    vehicleId={session.vehicleId}
                    status={session.status}
                    onAudioDetected={handleAudioDetected}
                    isProcessingAudio={isProcessingAudio}
                />

                {/* Chat Stream */}
                <div className="flex-1 min-h-0 h-full pointer-events-auto flex flex-col relative z-40 overflow-hidden">
                    <ChatStream
                        messages={messages as unknown as Message[]}
                        isVideoMode={!!session.videoUrl}
                        onImageCapture={handleImageCapture}
                        sessionId={session.id}
                        isLoading={isLoading}
                    />
                </div>

                {/* Controls */}
                <div className="pointer-events-auto pb-6">
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
            </div>
        </div>
    );
}
