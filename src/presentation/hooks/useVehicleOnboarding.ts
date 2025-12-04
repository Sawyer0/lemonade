import { useState } from 'react';
import { Vehicle } from '@/core/types/models';
import { Logger } from '@/infrastructure/logging/Logger';

export function useVehicleOnboarding() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'processing' | 'success' | 'error'>('idle');
    const [newVehicle, setNewVehicle] = useState<Vehicle | null>(null);

    const submitVin = async (vin: string, userId: string) => {
        setStatus('processing');

        try {
            const res = await fetch('/api/vehicles/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vin, userId }),
            });

            if (!res.ok) throw new Error('Failed to decode VIN');

            const data = await res.json();
            setNewVehicle(data.data);
            setStatus('success');
            return data.data;

        } catch (err) {
            const logger = new Logger();
            logger.error('Failed to decode VIN', err);
            setStatus('error');
        }
    };

    return { status, submitVin, newVehicle, setStatus };
}
