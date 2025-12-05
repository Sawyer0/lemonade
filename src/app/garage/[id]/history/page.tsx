import { ServiceHistory } from '@/presentation/components/garage/ServiceHistory';
import { container } from '@/infrastructure/di/container';
import { TYPES } from '@/infrastructure/di/types';
import { VehicleService } from '@/application/services/VehicleService';
import Link from 'next/link';

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const vehicleService = container.get<VehicleService>(TYPES.VehicleService);
    const history = await vehicleService.getHistory(id);
    // We might want to fetch vehicle details too for the header, but for now let's stick to history.
    // Actually, let's fetch vehicle details to show context.
    // Since VehicleService.onboardVehicle is for onboarding, we might need a getVehicle method.
    // But for now, let's just show history.

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
                        <p className="text-zinc-500 font-mono text-sm">Vehicle ID: {id}</p>
                    </div>
                </div>

                <ServiceHistory sessions={history} />
            </div>
        </div>
    );
}
