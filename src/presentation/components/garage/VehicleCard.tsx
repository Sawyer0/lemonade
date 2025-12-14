'use client';
import { Vehicle } from '@lemonade/core';

import Image from 'next/image';
import { Car, Loader2 } from 'lucide-react';
import { Button } from 'konsta/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { db } from '@/infrastructure/firebase/config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/presentation/context/AuthContext';

interface VehicleCardProps {
    vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
    const router = useRouter();
    const [diagnosing, setDiagnosing] = useState(false);
    const hasIssues = vehicle.activeIssuesCount > 0;
    const { user } = useAuth();

    // NATIVE FIX: Elevation over Borders
    const statusGlow = hasIssues ? 'shadow-red-900/10' : 'shadow-black/20';

    const handleDiagnose = async () => {
        if (diagnosing) return;
        if (!user) {
            alert('You must be logged in to start a session.');
            return;
        }

        setDiagnosing(true);
        try {
            const sessionId = uuidv4();
            // Create session directly via Client SDK to use current Auth context
            await setDoc(doc(db, 'sessions', sessionId), {
                id: sessionId,
                vehicleId: vehicle.id,
                userId: user.uid, // Use authenticated user ID
                status: 'active',
                complaint: 'New Session',
                obdCodes: [],
                messages: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                startedAt: serverTimestamp(),
                aiAnalysis: null,
                safety_stop: false
            });

            router.push(`/session/${sessionId}`);
        } catch (error) {
            // console.error(error);
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
            setDiagnosing(false);
        }
    };

    return (
        <div className="block group relative flex flex-col h-full active:scale-[0.99] transition-transform duration-200">
            <div className={`
        relative h-64 w-full rounded-t-2xl overflow-hidden bg-zinc-900 border-x border-t border-white/5 transition-all
        shadow-xl ${statusGlow}
      `}>

                {/* LAYER 1: THE REALITY ANCHOR (Real Photo) */}
                <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                    {vehicle.photoUrl ? (
                        <Image
                            src={vehicle.photoUrl}
                            alt={vehicle.specs.model}
                            fill
                            className="object-cover opacity-90"
                            unoptimized
                        />
                    ) : (
                        // NATIVE FIX: Icon instead of Text
                        <Car className="w-24 h-24 text-zinc-800" strokeWidth={1} />
                    )}
                </div>

                {/* LAYER 2: GRADIENT OVERLAY */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

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
                                <span className="bg-red-600/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse flex items-center gap-1.5 shadow-sm">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                                    {vehicle.activeIssuesCount} CODES
                                </span>
                            ) : (
                                <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-lg text-xs font-bold border border-green-500/20 backdrop-blur-md">
                                    HEALTHY
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* LAYER 4: ACTION FOOTER (Always Visible) */}
            <div className="bg-zinc-900 border-b border-x border-white/5 rounded-b-2xl p-4 flex gap-3">
                <div className="flex-1">
                    <Button
                        large
                        raised
                        onClick={handleDiagnose}
                        className="bg-blue-600 active:bg-blue-700 !text-white !font-bold !rounded-xl h-[52px]"
                        disabled={diagnosing}
                    >
                        {diagnosing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <div className="flex items-center gap-2 uppercase tracking-wide text-sm">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Diagnose
                            </div>
                        )}
                    </Button>
                </div>

                <div className="flex-1">
                    <Button
                        large
                        raised
                        onClick={() => router.push(`/garage/${vehicle.id}/history`)}
                        className="bg-zinc-800 active:bg-zinc-700 !text-zinc-300 !font-bold !rounded-xl h-[52px] border border-white/5"
                    >
                        <div className="flex items-center gap-2 uppercase tracking-wide text-sm">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            History
                        </div>
                    </Button>
                </div>
            </div>
        </div>
    );
}
