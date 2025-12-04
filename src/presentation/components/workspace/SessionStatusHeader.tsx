import React from 'react';
import { clsx } from 'clsx';
import { VoiceInput } from './VoiceInput';

interface SessionStatusHeaderProps {
    sessionId: string;
    status: 'active' | 'analyzing' | 'waiting_user' | 'completed' | 'error';
    onAudioDetected: (audio: Float32Array) => void;
    isProcessingAudio: boolean;
}

export function SessionStatusHeader({ sessionId, status, onAudioDetected, isProcessingAudio }: SessionStatusHeaderProps) {
    return (
        <div className="flex justify-between items-start pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                <div>
                    <h2 className="text-white font-bold">SESSION #{sessionId.slice(0, 4)}</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={clsx("w-2 h-2 rounded-full", {
                            'bg-green-500 animate-pulse': status === 'active',
                            'bg-yellow-500 animate-spin': status === 'analyzing',
                            'bg-blue-500': status === 'waiting_user',
                            'bg-red-500': status === 'error',
                            'bg-gray-500': status === 'completed'
                        })} />
                        <span className="text-xs text-zinc-400 uppercase">{status}</span>
                    </div>
                </div>

                <VoiceInput
                    onAudioDetected={onAudioDetected}
                    isProcessing={isProcessingAudio}
                />
            </div>
        </div>
    );
}
