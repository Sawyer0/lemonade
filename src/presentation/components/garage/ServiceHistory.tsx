/* eslint-disable react-hooks/rules-of-hooks */
"use client";

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';
import { auth } from '@/infrastructure/firebase/config';

interface ServiceHistoryProps {
    sessions: DiagnosticSession[];
}

export function ServiceHistory({ sessions }: ServiceHistoryProps) {
    const [items, setItems] = useState<DiagnosticSession[]>(sessions || []);
    const [isPending, startTransition] = useTransition();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isEmpty = useMemo(() => !items || items.length === 0, [items]);

    const handleDelete = async (sessionId: string) => {
        setError(null);
        setDeletingId(sessionId);
        startTransition(() => {
            (async () => {
                try {
                    const token = await auth.currentUser?.getIdToken();
                    if (!token) {
                        throw new AppError(ErrorCode.UNAUTHORIZED, 'You must be signed in to delete a session', 401);
                    }

                    const res = await fetch(`/api/sessions/${sessionId}`, {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (!res.ok) {
                        const data = await res.json().catch(() => null);
                        const message = data?.error || 'Failed to delete session';
                        throw new AppError(ErrorCode.INVALID_INPUT, message, res.status);
                    }

                    setItems((prev) => prev.filter((s) => s.id !== sessionId));
                } catch (err) {
                    const message = err instanceof AppError ? err.message : 'Unable to delete session right now';
                    setError(message);
                } finally {
                    setDeletingId((current) => (current === sessionId ? null : current));
                }
            })();
        });
    };

    if (isEmpty) {
        return (
            <div className="text-center py-20">
                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-white">No Service History</h3>
                <p className="text-zinc-400 mt-2">This vehicle hasn&apos;t had any diagnostic sessions yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-lg border border-red-900/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                    {error}
                </div>
            )}
            {items.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`} className="block group relative">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-blue-500/50 transition-colors relative overflow-hidden">
                        {/* Status Indicator Line */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${session.status === 'completed' ? 'bg-green-500' :
                            session.status === 'analyzing' ? 'bg-blue-500' :
                                'bg-zinc-700'
                            }`} />

                        <button
                            type="button"
                            className="absolute top-4 right-4 rounded-full border border-red-900/40 bg-red-950/60 px-3 py-1 text-xs font-semibold text-red-200 hover:border-red-500/60 hover:text-red-100"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDelete(session.id);
                            }}
                            disabled={deletingId === session.id || isPending}
                        >
                            {deletingId === session.id || isPending ? 'Deleting…' : 'Delete'}
                        </button>

                        <div className="flex justify-between items-start mb-4 pl-4 pr-12">
                            <div className="flex-1">
                                <div className="text-zinc-400 text-sm font-mono mb-1">
                                    {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    }) : 'Date unavailable'}
                                </div>
                                <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                                    {session.aiAnalysis?.diagnosis || "Diagnostic Session"}
                                </h3>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${session.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                                session.status === 'analyzing' ? 'bg-blue-900/30 text-blue-400' :
                                    'bg-zinc-800 text-zinc-400'
                                }`}>
                                {session.status?.replace('_', ' ') || 'Unknown'}
                            </div>
                        </div>

                        {session.aiAnalysis?.suggested_actions && session.aiAnalysis.suggested_actions.length > 0 && (
                            <p className="text-zinc-400 text-sm pl-4 pr-10 line-clamp-2">
                                Recommended: {session.aiAnalysis.suggested_actions.join(', ')}
                            </p>
                        )}

                        <div className="mt-4 pl-4 pr-10 flex items-center gap-4 text-xs text-zinc-500 font-mono">
                            <span>ID: {session.id.slice(0, 8)}</span>
                            <span>•</span>
                            <span>{session.messages?.length || 0} Messages</span>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
