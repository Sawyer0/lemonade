import React from 'react';
import { AIAnalysis } from '@/core/entities/DiagnosticSession';

interface AnalysisCardProps {
    analysis: AIAnalysis | null;
    isSafetyStop: boolean;
}

export function AnalysisCard({ analysis, isSafetyStop }: AnalysisCardProps) {
    if (!analysis || isSafetyStop) return null;

    return (
        <div className="mb-4 bg-black/80 backdrop-blur-xl p-4 rounded-xl border border-blue-500/30">
            <h3 className="text-blue-400 text-xs font-bold uppercase mb-1">MASTER TECH DIAGNOSIS</h3>
            <p className="text-white font-bold">{analysis.diagnosis}</p>
            <div className="flex gap-2 mt-2 overflow-x-auto">
                {analysis.suggested_actions.map((action, i) => (
                    <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-md whitespace-nowrap">
                        {action}
                    </span>
                ))}
            </div>
        </div>
    );
}
