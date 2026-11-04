'use client';

import React, { use } from 'react';
import { ServiceHistory } from '@/presentation/components/garage/ServiceHistory';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import { useAuth } from '@/presentation/context/AuthContext';
import Link from 'next/link';
import useSWR from 'swr';
import { Vehicle, DiagnosticSession } from '@lemonade/core';

export default function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading: authLoading } = useAuth();

    const fetcher = async (): Promise<{ vehicle: Vehicle | null; history: DiagnosticSession[] } | null> => {
        if (!user) return null;
        const vehicleService = clientContainer.get<VehicleService>(TYPES.VehicleService);
        const [vehicle, history] = await Promise.all([
            vehicleService.getVehicle(id, user.uid),
            vehicleService.getHistory(id), // Note: getHistory might also need userId later
        ]);
        return { vehicle, history };
    };

    const { data, isLoading: dataLoading, error } = useSWR(user ? `vehicle-history-${id}-${user.uid}` : null, fetcher);

    if (error) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="text-center text-red-500">
                    <p className="font-bold text-xl">Failed to load history</p>
                    <p className="text-sm text-zinc-400 mt-2">Please try again later.</p>
                </div>
            </div>
        );
    }

    if (authLoading || dataLoading) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500"></div>
            </div>
        );
    }

    if (!user) return null;

    const vehicle = data?.vehicle;
    const history = data?.history || [];

    return (
        <div className="min-h-screen bg-black text-white p-6">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/garage" className="p-2 hover:bg-zinc-900 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter">Service History</h1>
                        {vehicle ? (
                            <p className="text-zinc-500 font-mono text-sm">
                                {vehicle.specs.year} {vehicle.specs.make} {vehicle.specs.model} • {vehicle.vin}
                            </p>
                        ) : (
                            <p className="text-zinc-500 font-mono text-sm">Vehicle ID: {id}</p>
                        )}
                    </div>
                </div>

                <ServiceHistory sessions={history} vehicleId={id} loading={false} />
            </div>
        </div>
    );
}
