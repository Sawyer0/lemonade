import { Vehicle } from '@/core/types/models';
import Link from 'next/link';
import { useState } from 'react';

interface VehicleCardProps {
    vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
    const hasIssues = vehicle.activeIssuesCount > 0;
    const statusBorder = hasIssues ? 'border-red-500' : 'border-green-500/50';
    const statusGlow = hasIssues ? 'shadow-red-900/20' : 'shadow-green-900/10';

    const [showOverlay, setShowOverlay] = useState(false);

    // Accessibility & Mobile Logic
    // 1. Desktop: Hover triggers opacity + pointer-events
    // 2. Mobile: "Actions" button toggles state
    // 3. Keyboard: Focus triggers opacity
    const overlayVisibilityClass = showOverlay
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none';

    const linkPointerEvents = showOverlay
        ? 'pointer-events-auto'
        : 'pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto';

    return (
        <div className="block group relative">
            <div className={`
        relative h-56 w-full rounded-2xl overflow-hidden border-2 transition-all duration-300
        ${statusBorder} shadow-xl ${statusGlow} hover:scale-[1.02]
      `}>

                {/* LAYER 1: THE REALITY ANCHOR (Real Photo) */}
                <div className="absolute inset-0 bg-zinc-900">
                    {vehicle.photoUrl ? (
                        <img
                            src={vehicle.photoUrl}
                            alt={vehicle.specs.model}
                            className="object-cover w-full h-full opacity-90 group-hover:opacity-100 transition-opacity"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600 font-mono">
                            NO IMAGE
                        </div>
                    )}
                </div>

                {/* LAYER 2: GRADIENT OVERLAY */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

                {/* LAYER 3: THE VITALS DASHBOARD */}
                <div className="absolute bottom-0 w-full p-5">
                    <div className="flex justify-between items-end">

                        {/* Identity DNA */}
                        <div>
                            <h2 className="text-3xl font-black text-white tracking-tighter uppercase">
                                {vehicle.specs.year} {vehicle.specs.model}
                            </h2>
                            <p className="text-zinc-300 font-mono text-sm mt-1">
                                {vehicle.specs.trim} • {vehicle.specs.engine}
                            </p>
                        </div>

                        {/* Health Monitor Badge */}
                        <div className="flex flex-col items-end">
                            {hasIssues ? (
                                <span className="bg-red-600 text-white px-3 py-1 rounded-md text-xs font-bold animate-pulse flex items-center gap-1">
                                    <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                                    {vehicle.activeIssuesCount} CODES
                                </span>
                            ) : (
                                <span className="bg-green-600/90 text-white px-3 py-1 rounded-md text-xs font-bold border border-green-400/30">
                                    SYSTEM HEALTHY
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* MOBILE ACTIONS TOGGLE */}
                <button
                    onClick={() => {
                        setShowOverlay(!showOverlay);
                    }}
                    className="absolute top-3 right-3 z-20 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white/80 backdrop-blur-md md:hidden transition-colors"
                    aria-label="Toggle Actions"
                >
                    {showOverlay ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    )}
                </button>

            </div>
            {/* LAYER 4: ACTION BUTTONS (Hover/Focus/Toggle Reveal) */}
            <div
                className={`absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 transition-all duration-300 backdrop-blur-sm ${overlayVisibilityClass}`}
                aria-hidden={!showOverlay}
            >
                <Link
                    href={`/session/start?vehicleId=${vehicle.id}`}
                    className={`bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-full transform hover:scale-105 transition-all shadow-lg flex items-center gap-2 ${linkPointerEvents}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    DIAGNOSE
                </Link>
                <Link
                    href={`/garage/${vehicle.id}/history`}
                    className={`bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-8 rounded-full transform hover:scale-105 transition-all border border-zinc-600 flex items-center gap-2 ${linkPointerEvents}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    SERVICE HISTORY
                </Link>
            </div>

        </div>
    );
}
