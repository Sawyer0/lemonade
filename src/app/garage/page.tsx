'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { VehicleCard } from '@/presentation/components/garage/VehicleCard';
import { AddVehicleModal } from '@/presentation/components/garage/AddVehicleModal';
import { Vehicle } from '@/core/types/models';
import { useAuth } from '@/presentation/context/AuthContext';
import { auth } from '@/infrastructure/firebase/config';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function GaragePage() {
    const [isAdding, setIsAdding] = useState(false);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // 1. Auth Guard (Client-Side)
    // We still need this effect for redirection, as we are using client-side auth.
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        }
    }, [user, authLoading, router]);

    // 2. Data Fetching (Replaces useEffect)
    // Only fetch when user.uid is available (conditional fetching)
    const { data, error, isLoading, mutate } = useSWR(
        user ? `/api/vehicles?userId=${user.uid}` : null,
        fetcher
    );

    const vehicles: Vehicle[] = data?.data || [];

    if (authLoading || (isLoading && user)) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // If not loading and no user, we render nothing (waiting for redirect)
    if (!user) return null;

    return (
        <div className="min-h-screen bg-black text-white p-6 pb-24">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter">MY GARAGE</h1>
                    <p className="text-zinc-500 text-sm font-mono">MASTER TECH ACCESS GRANTED</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => auth.signOut()}
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-bold px-4 py-2 rounded-full border border-zinc-800"
                    >
                        SIGN OUT
                    </button>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white w-10 h-10 rounded-full flex items-center justify-center border border-zinc-600"
                    >
                        <span className="text-xl font-bold">+</span>
                    </button>
                </div>
            </div>

            {/* GRID LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map((car) => (
                    <VehicleCard key={car.id} vehicle={car} />
                ))}

                {/* EMPTY STATE / "ADD NEW" CARD */}
                <button
                    onClick={() => setIsAdding(true)}
                    className="h-56 w-full rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-600 flex flex-col items-center justify-center gap-4 group transition-colors"
                >
                    <div className="w-16 h-16 rounded-full bg-zinc-900 group-hover:bg-zinc-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                    <span className="text-zinc-500 font-bold">ADD PROJECT</span>
                </button>
            </div>

            {/* MODAL */}
            {isAdding && <AddVehicleModal onClose={() => {
                setIsAdding(false);
                mutate(); // Re-fetch data automatically
            }} />}
        </div>
    );
}
