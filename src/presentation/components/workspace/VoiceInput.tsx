import React, { useState, useEffect } from 'react';
import { useMicVAD } from "@ricky0123/vad-react";
import { useSWRConfig } from 'swr';

interface VoiceInputProps {
    onAudioDetected: (audio: Float32Array) => void;
    isProcessing: boolean;
}

export function VoiceInput({ onAudioDetected, isProcessing }: VoiceInputProps) {
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing'>('idle');

    const vad = useMicVAD({
        startOnLoad: true,
        onSpeechEnd: (audio) => {
            console.log("User finished speaking!");
            setStatus('processing');
            onAudioDetected(audio);
        },
        onSpeechStart: () => {
            setStatus('listening');
        },
        onVADMisfire: () => {
            setStatus('idle');
        }
    });

    // Sync internal status with prop
    useEffect(() => {
        if (!isProcessing && status === 'processing') {
            setStatus('idle');
        }
    }, [isProcessing, status]);

    return (
        <div className="flex items-center gap-2 p-2 rounded-full bg-slate-800/50 backdrop-blur-sm border border-slate-700">
            <div className={`w-3 h-3 rounded-full transition-colors duration-300 ${status === 'listening' ? 'bg-red-500 animate-pulse' :
                    status === 'processing' ? 'bg-yellow-500' : 'bg-slate-500'
                }`} />

            <span className="text-xs font-medium text-slate-300">
                {status === 'listening' ? 'Listening...' :
                    status === 'processing' ? 'Processing...' :
                        'Hands-Free Active'}
            </span>

            {vad.errored && (
                <span className="text-xs text-red-400">Mic Error</span>
            )}
        </div>
    );
}
