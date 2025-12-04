'use client';
import { useState } from 'react';
import { DiagnosticSession } from '@/core/types/models';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { useVoiceCommand } from '@/presentation/hooks/useVoiceCommand';
import { useToast } from '@/presentation/components/ui/Toast';
import { SafetyOverlay } from './SafetyOverlay';
import { SessionStatusHeader } from './SessionStatusHeader';
import { ChatStream } from './ChatStream';
import { AnalysisCard } from './AnalysisCard';
import { InputBar } from './InputBar';

interface CameraWorkspaceProps {
    session: DiagnosticSession;
    onSendMessage: (msg: string) => void;
}

export function CameraWorkspace({ session, onSendMessage }: CameraWorkspaceProps) {
    const [input, setInput] = useState('');
    const { uploadFile, uploading, progress } = useDirectUpload();
    const { processAudio, isProcessing: isProcessingAudio } = useVoiceCommand();
    const { showToast } = useToast();

    const isSafetyStop = !!session.aiAnalysis?.safety_alert;

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
            } catch (err) {
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

    return (
        <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">

            {/* LAYER 1: VIEWPORT (Video/Camera) */}
            <div className="absolute inset-0 z-0">
                {session.videoUrl ? (
                    <video
                        src={session.videoUrl}
                        className="w-full h-full object-cover opacity-50"
                        controls
                        playsInline
                    />
                ) : (
                    <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                        <p className="text-zinc-500 font-mono">WAITING FOR VIDEO FEED...</p>
                    </div>
                )}
            </div>

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
                <ChatStream messages={session.messages} />

                {/* Controls */}
                <div className="pointer-events-auto pb-6">
                    <AnalysisCard
                        analysis={session.aiAnalysis}
                        isSafetyStop={isSafetyStop}
                    />

                    <InputBar
                        input={input}
                        setInput={setInput}
                        onSendMessage={onSendMessage}
                        onUpload={handleUpload}
                        uploading={uploading}
                        progress={progress}
                    />
                </div>

            </div>
        </div>
    );
}
