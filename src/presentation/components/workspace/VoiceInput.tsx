import React, { useState, useEffect, useMemo } from 'react';
import { useMicVAD } from "@ricky0123/vad-react";
import { Logger } from '@/infrastructure/logging/Logger';

interface VoiceInputProps {
    onAudioDetected: (audio: Float32Array) => void;
    isProcessing: boolean;
}

export function VoiceInput({ onAudioDetected, isProcessing }: VoiceInputProps) {
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing'>('idle');
    const logger = useMemo(() => new Logger(), []);

    interface OrtConfig {
        env: {
            wasm: {
                wasmPaths: string;
            };
        };
    }

    const vad = useMicVAD({
        startOnLoad: true,
        workletURL: "/vad/vad.worklet.bundle.min.js",
        modelURL: "/vad/silero_vad.onnx",
        ortConfig: (ort: OrtConfig) => {
            ort.env.wasm.wasmPaths = "/vad/";
        },
        onSpeechEnd: (audio: Float32Array) => {
            logger.info('Speech detected', { audioLength: audio.length });
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
            const timer = setTimeout(() => setStatus('idle'), 0);
            return () => clearTimeout(timer);
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
