import { useState } from 'react';
import { Vehicle } from '@/core/entities/Vehicle';
import { Logger } from '@/infrastructure/logging/Logger';
import { auth } from '@/infrastructure/firebase/config';

export function useVehicleOnboarding() {
    const [status, setStatus] = useState<'idle' | 'scanning' | 'processing' | 'success' | 'error'>('idle');
    const [newVehicle, setNewVehicle] = useState<Vehicle | null>(null);

    const submitVin = async (vin: string, userId: string) => {
        setStatus('processing');

        try {
            // Get the Firebase ID token
            const token = await auth.currentUser?.getIdToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const res = await fetch('/api/vehicles/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ vin, userId }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || errorData.error || 'Failed to decode VIN');
            }

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

