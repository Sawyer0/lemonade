import { useState } from 'react';
import { Vehicle, AppError, ErrorCode } from '@lemonade/core';
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
                throw new AppError(ErrorCode.UNAUTHORIZED, 'Not authenticated');
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
                throw new AppError(ErrorCode.VALIDATION_ERROR, errorData.details || errorData.error || 'Failed to decode VIN');
            }

            const data = await res.json();
            setNewVehicle(data.data);
            setStatus('success');
            return data.data;

        } catch (err) {
            console.error('Failed to decode VIN', err);
            setStatus('error');
        }
    };

    return { status, submitVin, newVehicle, setStatus };
}

