'use client';

import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ServiceHistory } from '@/presentation/components/garage/ServiceHistory';
import { useAuth } from '@/presentation/context/AuthContext';
import { ApiClient } from '@/infrastructure/api/ApiClient';
import { CONFIG } from '@/infrastructure/config';
import type { VehicleHistoryResponseDTO } from '@/application/dtos/vehicle.dto';

export default function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // Read through the API (Admin SDK + ownership check) rather than the browser Firestore SDK.
    const { data, isLoading, error } = useSWR<VehicleHistoryResponseDTO>(
        user ? CONFIG.API.ROUTES.VEHICLE_HISTORY(id) : null,
        (url: string) => ApiClient.get<VehicleHistoryResponseDTO>(url),
    );

    useEffect(() => {
        if (!authLoading && !user) router.push('/');
    }, [authLoading, user, router]);

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

    if (!authLoading && !user) return null;

    const vehicle = data?.data.vehicle;
    const subtitle = vehicle
        ? `${vehicle.specs.year} ${vehicle.specs.make} ${vehicle.specs.model} • ${vehicle.vin}`
        : undefined;

    return (
        <ServiceHistory
            sessions={data?.data.sessions ?? []}
            vehicleId={id}
            loading={authLoading || isLoading}
            subtitle={subtitle}
        />
    );
}
