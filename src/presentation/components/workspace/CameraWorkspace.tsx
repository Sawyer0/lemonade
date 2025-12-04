'use client';
import { useState, useRef } from 'react';
import { DiagnosticSession } from '@/core/types/models';
import { useDirectUpload } from '@/presentation/hooks/useDirectUpload';
import { clsx } from 'clsx';

interface CameraWorkspaceProps {
    session: DiagnosticSession;
    onSendMessage: (msg: string) => void;
}

export function CameraWorkspace({ session, onSendMessage }: CameraWorkspaceProps) {
    const [input, setInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { uploadFile, uploading, progress } = useDirectUpload();

    const isSafetyStop = session.aiAnalysis?.safety_alert;

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
            } catch (err) {
                alert('Upload failed');
            }
        }
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
            {isSafetyStop && (
                <div className="absolute inset-0 z-50 bg-red-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center animate-pulse">
                    <div className="text-6xl mb-4">🛑</div>
                    <h1 className="text-4xl font-black text-white mb-2">SAFETY STOP TRIGGERED</h1>
                    <p className="text-xl text-red-200 font-bold max-w-md">
                        {session.aiAnalysis?.diagnosis}
                    </p>
                    <button
                        onClick={() => alert('Acknowledge Safety Protocol')}
                        className="mt-8 bg-white text-red-900 font-bold px-8 py-4 rounded-full hover:scale-105 transition-transform"
                    >
                        I ACKNOWLEDGE THE RISK
                    </button>
                </div>
            )}

            {/* LAYER 3: HUD (Heads Up Display) */}
            <div className="relative z-10 flex-1 flex flex-col justify-between p-4 pointer-events-none">

                {/* Top Bar */}
                <div className="flex justify-between items-start pointer-events-auto">
                    <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                        <h2 className="text-white font-bold">SESSION #{session.id.slice(0, 4)}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={clsx("w-2 h-2 rounded-full", {
                                'bg-green-500 animate-pulse': session.status === 'active',
                                'bg-yellow-500 animate-spin': session.status === 'analyzing',
                                'bg-blue-500': session.status === 'waiting_user'
                            })} />
                            <span className="text-xs text-zinc-400 uppercase">{session.status}</span>
                        </div>
                    </div>
                </div>

                {/* Chat Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 mask-image-gradient">
                    {session.messages.map((msg, idx) => (
                        <div key={idx} className={clsx("flex", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                            <div className={clsx(
                                "max-w-[80%] p-4 rounded-2xl backdrop-blur-md border border-white/10 pointer-events-auto",
                                msg.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-zinc-900/80 text-zinc-200'
                            )}>
                                <p className="text-sm">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Controls */}
                <div className="pointer-events-auto pb-6">
                    {/* AI Analysis Result Card */}
                    {session.aiAnalysis && !isSafetyStop && (
                        <div className="mb-4 bg-black/80 backdrop-blur-xl p-4 rounded-xl border border-blue-500/30">
                            <h3 className="text-blue-400 text-xs font-bold uppercase mb-1">MASTER TECH DIAGNOSIS</h3>
                            <p className="text-white font-bold">{session.aiAnalysis.diagnosis}</p>
                            <div className="flex gap-2 mt-2 overflow-x-auto">
                                {session.aiAnalysis.suggested_actions.map((action, i) => (
                                    <span key={i} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-md whitespace-nowrap">
                                        {action}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input Bar */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="bg-zinc-800 text-white w-12 h-12 rounded-full flex items-center justify-center shrink-0 hover:bg-zinc-700 transition-colors"
                        >
                            {uploading ? (
                                <span className="text-xs font-mono">{Math.round(progress)}%</span>
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            )}
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="video/*"
                            onChange={handleUpload}
                        />

                        <form
                            className="flex-1 flex gap-2"
                            onSubmit={(e) => { e.preventDefault(); onSendMessage(input); setInput(''); }}
                        >
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask Master Tech..."
                                className="flex-1 bg-zinc-900/90 border border-zinc-700 rounded-full px-6 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <button
                                type="submit"
                                className="bg-blue-600 text-white w-12 h-12 rounded-full flex items-center justify-center shrink-0 hover:bg-blue-500"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
