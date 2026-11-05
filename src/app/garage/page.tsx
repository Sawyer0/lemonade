'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { Page, Navbar, Link, Block, Button } from 'konsta/react';
import { VehicleCard } from '@/presentation/components/garage/VehicleCard';
import { Vehicle, IAuthService } from '@lemonade/core';
import { useAuth } from '@/presentation/context/AuthContext';
import { useToast } from '@/presentation/context/ToastContext';
import { ApiClient } from '@/infrastructure/api/ApiClient';
import type { VehicleListResponseDTO } from '@/application/dtos/vehicle.dto';
import { CONFIG } from '@/infrastructure/config';
import { clientContainer } from '@/infrastructure/di/clientContainer';
import { TYPES } from '@/infrastructure/di/types';
import { Plus, LogOut } from 'lucide-react';

const AddVehicleModal = dynamic(
    () => import('@/presentation/components/garage/AddVehicleModal').then((mod) => mod.AddVehicleModal),
    {
        ssr: false,
        loading: () => null,
    },
);
const UpgradeModal = dynamic(
    () => import('@/presentation/components/modals/UpgradeModal').then((mod) => mod.UpgradeModal),
    {
        ssr: false,
        loading: () => null,
    },
);

export default function GaragePage() {
    const { user, loading: authLoading } = useAuth();
    const [isAdding, setIsAdding] = useState(false);
    const [showUpgrade, setShowUpgrade] = useState(false);

    const fetcher = async <T,>(url: string): Promise<T> => {
        return ApiClient.get<T>(url);
    };

    const { data: userData } = useSWR<{ data: { tier: string } }>(user ? CONFIG.API.ROUTES.PROFILE : null, fetcher);
    const userTier = userData?.data?.tier === 'pro' ? 'pro' : 'free';

    // The API derives the owner from the ID token, so no userId goes in the URL.
    const {
        data: vehiclesData,
        isLoading,
        mutate,
    } = useSWR<VehicleListResponseDTO>(user ? CONFIG.API.ROUTES.VEHICLES : null, fetcher);
    const vehicles: Vehicle[] = vehiclesData?.data ?? [];

    const { showToast } = useToast();
    const [portalLoading, setPortalLoading] = useState(false);
    const router = useRouter();

    const handleManageSubscription = async () => {
        try {
            setPortalLoading(true);
            const { url } = await ApiClient.post<{ url: string }, void>(CONFIG.API.ROUTES.STRIPE_PORTAL, undefined);
            window.location.href = url;
        } catch {
            showToast('Failed to open subscription management', 'error');
        } finally {
            setPortalLoading(false);
        }
    };

    const handleSignOut = async () => {
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SIGN_OUT' }));
        }
        const authService = clientContainer.get<IAuthService>(TYPES.AuthService);
        await authService.signOut();
    };

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/');
        } else if (user) {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'LOGIN_SUCCESS' }));
            }
        }
    }, [user, authLoading, router]);

    if (authLoading || (isLoading && user)) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <Page className="!bg-black">
            <Navbar
                title="My Garage"
                className="top-0 sticky"
                right={
                    <div className="flex gap-2">
                        {userTier === 'pro' ? (
                            <Button
                                small
                                outline
                                onClick={handleManageSubscription}
                                disabled={portalLoading}
                                className="!border-zinc-700 !text-zinc-400"
                            >
                                {portalLoading ? '...' : 'Manage'}
                            </Button>
                        ) : (
                            <Button
                                small
                                tonal
                                onClick={() => setShowUpgrade(true)}
                                className="!bg-gradient-to-r !from-yellow-500 !to-orange-500 !text-black font-bold"
                            >
                                Upgrade
                            </Button>
                        )}
                        <Link onClick={handleSignOut} iconOnly>
                            <LogOut className="w-6 h-6 text-zinc-400" />
                        </Link>
                        <Link onClick={() => setIsAdding(true)} iconOnly>
                            <Plus className="w-6 h-6 text-white" />
                        </Link>
                    </div>
                }
            />

            <Block className="!my-6 pb-safe">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vehicles.map((car) => (
                        <div key={car.id} className="h-full">
                            <VehicleCard vehicle={car} />
                        </div>
                    ))}

                    <button
                        onClick={() => setIsAdding(true)}
                        className="h-56 w-full rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-600 flex flex-col items-center justify-center gap-4 group transition-colors bg-zinc-900/20"
                    >
                        <div className="w-16 h-16 rounded-full bg-zinc-900 group-hover:bg-zinc-800 flex items-center justify-center">
                            <Plus className="w-8 h-8 text-zinc-500" />
                        </div>
                        <span className="text-zinc-500 font-bold">ADD PROJECT</span>
                    </button>
                </div>
            </Block>

            {isAdding && (
                <AddVehicleModal
                    onClose={() => {
                        setIsAdding(false);
                        mutate();
                    }}
                />
            )}

            {showUpgrade && <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />}
        </Page>
    );
}
