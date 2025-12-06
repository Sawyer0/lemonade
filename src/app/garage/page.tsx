'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { VehicleCard } from '@/presentation/components/garage/VehicleCard';
import { AddVehicleModal } from '@/presentation/components/garage/AddVehicleModal';
import { UpgradeModal } from '@/presentation/components/modals/UpgradeModal';
import { Vehicle } from '@/core/entities/Vehicle';
import { useAuth } from '@/presentation/context/AuthContext';
import { auth } from '@/infrastructure/firebase/config';
import { Crown, Zap } from 'lucide-react';

export default function GaragePage() {
    const { user, loading: authLoading } = useAuth();
    const [isAdding, setIsAdding] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);
    const fetcher = async (url: string) => {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('No token');

        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return res.json();
    };

    // 2. Fetch user tier via SWR (Standardized)
    const { data: userData } = useSWR(
        user ? '/api/users/me' : null,
        fetcher
    );

    const userTier = userData?.data?.tier === 'pro' ? 'pro' : 'free';

    // 3. Data Fetching (Vehicles)

    const { data, isLoading, mutate } = useSWR(
        user ? `/api/vehicles?userId=${user.uid}` : null,
        fetcher
    );

    const vehicles: Vehicle[] = data?.data || [];

    const [portalLoading, setPortalLoading] = useState(false);

    const handleManageSubscription = async () => {
        try {
            setPortalLoading(true);
            const token = await auth.currentUser?.getIdToken();
            if (!token) return;

            const res = await fetch('/api/stripe/portal', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) throw new Error('Failed to create portal session');

            const { url } = await res.json();
            window.location.href = url;
        } catch (error) {
            console.error('Portal Error:', error);
            alert('Failed to open subscription management');
        } finally {
            setPortalLoading(false);
        }
    };

    if (authLoading || (isLoading && user)) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-black text-white p-6 pb-24">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl font-black tracking-tighter">MY GARAGE</h1>
                        {userTier === 'pro' ? (
                            <span className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-full text-xs font-bold text-yellow-400">
                                <Crown className="w-3 h-3" />
                                PRO
                            </span>
                        ) : (
                            <span className="px-3 py-1 bg-zinc-800 border border-zinc-700 rounded-full text-xs font-bold text-zinc-400">
                                FREE
                            </span>
                        )}
                    </div>
                    <p className="text-zinc-500 text-sm font-mono">MASTER TECH ACCESS GRANTED</p>
                </div>
                <div className="flex gap-2">
                    {userTier === 'pro' ? (
                        <button
                            onClick={handleManageSubscription}
                            disabled={portalLoading}
                            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-bold px-4 py-2 rounded-full border border-zinc-800 disabled:opacity-50"
                        >
                            {portalLoading ? 'LOADING...' : 'MANAGE SUBSCRIPTION'}
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowUpgrade(true)}
                            className="flex items-center gap-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-xs font-bold px-4 py-2 rounded-full hover:from-yellow-400 hover:to-orange-400"
                        >
                            <Zap className="w-3 h-3" />
                            UPGRADE TO PRO
                        </button>
                    )}
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

            {/* MODALS */}
            {isAdding && <AddVehicleModal onClose={() => {
                setIsAdding(false);
                mutate(); // Re-fetch data automatically
            }} />}

            <UpgradeModal
                isOpen={showUpgrade}
                onClose={() => setShowUpgrade(false)}
            />
        </div>
    );
}
