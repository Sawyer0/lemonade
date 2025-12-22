'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface ToolMessageProps {
    toolName: string;
    state: 'call' | 'result';
    isUser: boolean; // To style it against the background
}

export function ToolMessage({ toolName, state, isUser }: ToolMessageProps) {
    const [dots, setDots] = useState('');

    useEffect(() => {
        if (state === 'call') {
            const interval = setInterval(() => {
                setDots(prev => prev.length >= 3 ? '' : prev + '.');
            }, 500);
            return () => clearInterval(interval);
        }
    }, [state]);

    const isSearch = toolName.toLowerCase().includes('search');
    const label = isSearch
        ? (state === 'call' ? 'Searching Google' : 'Search Complete')
        : (state === 'call' ? `Using ${toolName}` : `${toolName} Finished`);

    return (
        <div className={clsx(
            "my-2 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono select-none",
            isUser ? "bg-blue-500/10 border-blue-500/20 text-blue-200" : "bg-black/20 border-white/10 text-zinc-300"
        )}>
            {state === 'call' ? (
                // Loading Spinner / Icon
                <div className="relative flex items-center justify-center w-4 h-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-20"></span>
                    {isSearch ? (
                        <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    ) : (
                        <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}
                </div>
            ) : (
                // Completed Check
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            )}

            <span>{label}{state === 'call' && dots}</span>
        </div>
    );
}

