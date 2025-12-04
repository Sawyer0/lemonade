import React from 'react';
import { AIAnalysis } from '@/core/types/models';

interface SafetyOverlayProps {
    analysis: AIAnalysis | null;
    onAcknowledge: () => void;
}

export function SafetyOverlay({ analysis, onAcknowledge }: SafetyOverlayProps) {
    if (!analysis?.safety_alert) return null;

    return (
        <div className="absolute inset-0 z-50 bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center animate-pulse">
            <div className="text-6xl mb-4">🛑</div>
            <h1 className="text-4xl font-black text-white mb-2">SAFETY STOP TRIGGERED</h1>
            <p className="text-xl text-red-200 font-bold max-w-md">
                {analysis.diagnosis}
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
