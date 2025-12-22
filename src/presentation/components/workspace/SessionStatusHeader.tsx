import React from 'react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface SessionStatusHeaderProps {
    sessionId: string;
    vehicleId: string;
    status: 'active' | 'analyzing' | 'waiting_user' | 'completed' | 'error';
}

export function SessionStatusHeader({ sessionId, vehicleId, status }: SessionStatusHeaderProps) {
    return (
        <div className="flex justify-between items-start pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                <Link
                    href={`/garage/${vehicleId}/history`}
                    className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Link>

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
            </div>
        </div>
    );
}

