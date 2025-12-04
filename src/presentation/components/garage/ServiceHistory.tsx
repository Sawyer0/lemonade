import { DiagnosticSession } from '@/core/types/models';
import Link from 'next/link';

interface ServiceHistoryProps {
    sessions: DiagnosticSession[];
}

export function ServiceHistory({ sessions }: ServiceHistoryProps) {
    if (!sessions || sessions.length === 0) {
        return (
            <div className="text-center py-20">
                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </div>
                <h3 className="text-xl font-bold text-white">No Service History</h3>
                <p className="text-zinc-400 mt-2">This vehicle hasn't had any diagnostic sessions yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {sessions.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`} className="block group">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-blue-500/50 transition-colors relative overflow-hidden">
                        {/* Status Indicator Line */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${session.status === 'completed' ? 'bg-green-500' :
                            session.status === 'analyzing' ? 'bg-blue-500' :
                                'bg-zinc-700'
                            }`} />

                        <div className="flex justify-between items-start mb-4 pl-4">
                            <div>
                                <div className="text-zinc-400 text-sm font-mono mb-1">
                                    {session.updatedAt ? new Date(session.updatedAt).toLocaleDateString(undefined, {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    }) : 'Date unavailable'}
                                </div>                                <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
                                    {session.aiAnalysis?.diagnosis || "Diagnostic Session"}
                                </h3>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${session.status === 'completed' ? 'bg-green-900/30 text-green-400' :
                                session.status === 'analyzing' ? 'bg-blue-900/30 text-blue-400' :
                                    'bg-zinc-800 text-zinc-400'
                                }`}>
                                {session.status?.replace('_', ' ') || 'Unknown'}
                            </div>
                            {session.aiAnalysis?.suggested_actions && session.aiAnalysis.suggested_actions.length > 0 && (
                                <p className="text-zinc-400 text-sm pl-4 line-clamp-2">
                                    Recommended: {session.aiAnalysis.suggested_actions.join(', ')}
                                </p>
                            )}

                            <div className="mt-4 pl-4 flex items-center gap-4 text-xs text-zinc-500 font-mono">
                                <span>ID: {session.id.slice(0, 8)}</span>
                                <span>•</span>
                                <span>{session.messages?.length || 0} Messages</span>
                            </div>
                        </div>
                    </div>
                </Link>
            ))}
        </div>
    );
}
