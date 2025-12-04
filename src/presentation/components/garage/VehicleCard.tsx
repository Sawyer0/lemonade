import { Vehicle } from '@/core/types/models';
import Link from 'next/link';

interface VehicleCardProps {
    vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
    const hasIssues = vehicle.activeIssuesCount > 0;
    const statusBorder = hasIssues ? 'border-red-500' : 'border-green-500/50';
    const statusGlow = hasIssues ? 'shadow-red-900/20' : 'shadow-green-900/10';

    return (
        <Link href={`/garage/${vehicle.id}`} className="block group">
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

            </div>
        </Link>
    );
}
