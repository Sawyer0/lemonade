'use client';
import { useState, useEffect, useRef } from 'react';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { useVoiceCommand } from '@/presentation/hooks/useVoiceCommand';
import { useTTS } from '@/presentation/hooks/useTTS';
import { useToast } from '@/presentation/components/ui/Toast';
import { SafetyOverlay } from './SafetyOverlay';
import { SessionStatusHeader } from './SessionStatusHeader';
import { ChatStream } from './ChatStream';
import { AnalysisCard } from './AnalysisCard';
import { InputBar } from './InputBar';
import { useChat } from '@ai-sdk/react';

// Define Message interface locally since import from 'ai' is failing
interface ToolInvocation {
    toolName: string;
    toolCallId: string;
    state: 'call' | 'result';
    result?: Record<string, unknown>;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolInvocations?: ToolInvocation[];
}

interface CameraWorkspaceProps {
    session: DiagnosticSession;
}

export function CameraWorkspace({ session }: CameraWorkspaceProps) {
    // useChat v5: Input state is managed manually.
    // We use sendMessage to trigger the AI.
    const { messages, sendMessage, status } = useChat({
        api: '/api/chat',
        body: { sessionId: session.id },
        initialMessages: session.messages.map((m: Record<string, unknown>) => ({
            id: (m.timestamp as Date).toString(),
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content as string
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const [input, setInput] = useState('');
    const [voiceMode] = useState(false);
    const { uploadFile, uploading, progress } = useDirectUpload();
    const { processAudio, isProcessing: isProcessingAudio } = useVoiceCommand();
    const { showToast } = useToast();
    const { speak, stop, isSpeaking } = useTTS();
    const lastSpokenMessageRef = useRef<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _chatStatus = status;

    const isSafetyStop = !!session.aiAnalysis?.safety_alert;

    // Auto-speak AI messages when in Voice Mode
    useEffect(() => {
        if (!voiceMode || messages.length === 0) return;

        // Find the latest AI message
        const aiMessages = messages.filter(m => m.role === 'assistant');
        if (aiMessages.length === 0) return;

        const latestAiMessage = aiMessages[aiMessages.length - 1];

        // Only speak if it's a new message we haven't spoken yet
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

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            try {
                const publicUrl = await uploadFile(file, session.id);
                // Trigger analysis via API (Fire and Forget)
                await fetch('/api/analysis/trigger', {
                    method: 'POST',
                    body: JSON.stringify({ sessionId: session.id, publicUrl })
                });
                showToast('Video uploaded successfully', 'success');
            } catch {
                showToast('Upload failed. Please try again.', 'error');
            }
        }
    };

    const handleAudioDetected = async (audioData: Float32Array) => {
        await processAudio(audioData, session.id);
        // The backend (DiagnosticService) adds the message to the session history.
        // The useLiveSession hook (parent) will automatically update the UI 
        // when the Firestore document changes.
    };

    const handleSendMessage = async (content: string) => {
        if (!content.trim()) return;

        // Send user message to chat
        // Using sendMessage which is available in UseChatHelpers
        await sendMessage({
            role: 'user',
            content
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        setInput('');
    };

    const handleImageCapture = async (file: File) => {
        try {
            const publicUrl = await uploadFile(file, session.id);

            // Send the image URL to the AI
            await sendMessage({
                role: 'user',
                content: `[IMAGE UPLOADED] I have captured an image of the part: ${publicUrl}`
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            showToast('Image captured and sent!', 'success');
        } catch (error) {
            console.error('Failed to handle image capture:', error);
            showToast('Failed to send image.', 'error');
        }
    };

    return (
        <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">

            {/* LAYER 1: VIEWPORT (Video/Camera) */}
            <div className="absolute inset-0 z-0">
                {session.videoUrl ? (
                    <video
                        src={session.videoUrl}
                        className="w-full h-full object-cover"
                        controls={false}
                        autoPlay
                        loop
                        muted
                        playsInline
                    />
                ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <p className="text-zinc-500 font-mono">WAITING FOR VIDEO FEED...</p>
                    </div>
                )}
            </div>

            {/* Gradient Overlay for Text Readability */}
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

            {/* LAYER 2: SAFETY OVERLAY (Red Zone) */}
            <SafetyOverlay
                analysis={session.aiAnalysis}
                onAcknowledge={() => showToast('Safety Protocol Acknowledged', 'success')}
            />

            {/* LAYER 3: HUD (Heads Up Display) */}
            <div className="relative z-10 flex-1 flex flex-col justify-between p-4 pointer-events-none">

                {/* Top Bar */}
                <SessionStatusHeader
                    sessionId={session.id}
                    status={session.status}
                    onAudioDetected={handleAudioDetected}
                    isProcessingAudio={isProcessingAudio}
                />

                {/* Chat Stream */}
                <div className="flex-1 min-h-0 pointer-events-auto flex flex-col relative z-40">
                    <ChatStream
                        messages={messages as unknown as Message[]}
                        isVideoMode={!!session.videoUrl}
                        onImageCapture={handleImageCapture}
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
