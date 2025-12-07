import { Vehicle } from '@/core/entities/Vehicle';
import Link from 'next/link';
import Image from 'next/image';

interface VehicleCardProps {
    vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
    const hasIssues = vehicle.activeIssuesCount > 0;
    const statusBorder = hasIssues ? 'border-red-500' : 'border-green-500/50';
    const statusGlow = hasIssues ? 'shadow-red-900/20' : 'shadow-green-900/10';

    return (
        <div className="block group relative flex flex-col h-full">
            <div className={`
        relative h-64 w-full rounded-t-2xl overflow-hidden border-t-2 border-x-2 transition-all duration-300
        ${statusBorder} shadow-xl ${statusGlow}
      `}>

                {/* LAYER 1: THE REALITY ANCHOR (Real Photo) */}
                <div className="absolute inset-0 bg-zinc-900">
                    {vehicle.photoUrl ? (
                        <Image
                            src={vehicle.photoUrl}
                            alt={vehicle.specs.model}
                            fill
                            className="object-cover opacity-90"
                            unoptimized
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
            </div>

            {/* LAYER 4: ACTION FOOTER (Always Visible) */}
            <div className={`
                bg-zinc-900 border-b-2 border-x-2 ${statusBorder} rounded-b-2xl p-4 flex gap-3
            `}>
                <Link
                    href={`/session/start?vehicleId=${vehicle.id}`}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Diagnose
                </Link>
                <Link
                    href={`/garage/${vehicle.id}/history`}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl transition-all border border-zinc-600 flex items-center justify-center gap-2 text-sm uppercase tracking-wide"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    History
                </Link>
            </div>
        </div>
    );
}
