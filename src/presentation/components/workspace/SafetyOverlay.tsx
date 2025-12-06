'use client';
import React from 'react';
import { AIAnalysis } from '@/core/entities/DiagnosticSession';
import { Camera, ShieldAlert } from 'lucide-react';

interface SafetyOverlayProps {
    active: boolean;
    reason?: string;
    onAcknowledge: () => void;
    verificationPending?: boolean;
    onCaptureFrame?: () => void;
}

export function SafetyOverlay({
    active,
    reason,
    onAcknowledge,
    verificationPending = false,
    onCaptureFrame
}: SafetyOverlayProps) {

    // State 1: Safety Verification Required (Yellow Zone)
    if (verificationPending) {
        return (
            <div className="absolute inset-0 z-50 bg-yellow-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-yellow-500/20 p-6 rounded-full mb-4">
                    <ShieldAlert className="w-16 h-16 text-yellow-400" />
                </div>
                <h1 className="text-3xl font-black text-white mb-2">
                    SAFETY VERIFICATION REQUIRED
                </h1>
                <p className="text-lg text-yellow-200 max-w-md mb-6">
                    Before you proceed, I need to verify your safety setup.
                    Please point your camera at the jack stands.
                </p>
                <button
                    onClick={() => onCaptureFrame?.()}
                    className="flex items-center gap-2 bg-white text-yellow-900 font-bold px-8 py-4 rounded-full hover:scale-105 transition-transform"
                    disabled={!onCaptureFrame}
                >
                    <Camera className="w-5 h-5" />
                    SHOW JACK STANDS
                </button>            </div>
        );
    }

    // State 2: Critical Safety Alert (Red Zone)
    if (active) {
        return (
            <div className="absolute inset-0 z-50 bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center animate-pulse">
                <div className="text-6xl mb-4">🛑</div>
                <h1 className="text-4xl font-black text-white mb-2">SAFETY STOP TRIGGERED</h1>
                <p className="text-xl text-red-200 font-bold max-w-md">
                    {reason || "Safety Violation Detected"}
                </p>
                <button
                    onClick={onAcknowledge}
                    className="mt-8 bg-white text-red-900 font-bold px-8 py-4 rounded-full hover:scale-105 transition-transform"
                >
                    I ACKNOWLEDGE THE RISK
                </button>
            </div>
        );
    }

    // State 3: No safety issues
    return null;
}
