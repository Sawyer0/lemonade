'use client';
import { useState, useEffect } from 'react';
import { VehicleCard } from '@/presentation/components/garage/VehicleCard';
import { AddVehicleModal } from '@/presentation/components/garage/AddVehicleModal';
import { Vehicle } from '@/core/types/models';
import { useAuth } from '@/presentation/context/AuthContext';

export default function GaragePage() {
    const [isAdding, setIsAdding] = useState(false);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        if (!user) return;

        const fetchVehicles = async () => {
            try {
                const res = await fetch(`/api/vehicles?userId=${user.uid}`);
                if (res.ok) {
                    const data = await res.json();
                    setVehicles(data.data);
                }
            } catch (err) {
                console.error("Failed to load garage", err);
            } finally {
                setLoading(false);
            }
        };

        fetchVehicles();
    }, [user]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-6 pb-24">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter">MY GARAGE</h1>
                    <p className="text-zinc-500 text-sm font-mono">MASTER TECH ACCESS GRANTED</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white w-10 h-10 rounded-full flex items-center justify-center border border-zinc-600"
                >
                    <span className="text-xl font-bold">+</span>
                </button>
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
                // Quick refresh hack for MVP - ideally we'd use SWR mutate or context
                if (user) {
                    fetch(`/api/vehicles?userId=${user.uid}`)
                        .then(res => res.json())
                        .then(data => setVehicles(data.data));
                }
            }} />}
        </div>
    );
}
