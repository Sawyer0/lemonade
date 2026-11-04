import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@mobile/infrastructure/firebase/config';
import { useVehicle } from './useVehicle';

/**
 * Resolves the vehicle a diagnostic session belongs to. Screens that are
 * opened with only a session id (live mechanic, glasses) read the vehicle
 * from the session document instead of trusting a route parameter.
 */
export function useSessionVehicle(sessionId?: string) {
    const [vehicleId, setVehicleId] = useState<string | undefined>(undefined);
    const [sessionError, setSessionError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) return;

        return onSnapshot(
            doc(db, 'sessions', sessionId),
            (snapshot) => {
                const value: unknown = snapshot.data()?.vehicleId;
                if (typeof value === 'string' && value.length > 0) {
                    setVehicleId(value);
                    setSessionError(null);
                } else {
                    setSessionError('Session has no vehicle');
                }
            },
            () => setSessionError('Failed to load session'),
        );
    }, [sessionId]);

    const { vehicle, loading, error } = useVehicle(vehicleId);

    return {
        vehicleId,
        vehicle,
        loading: Boolean(sessionId) && !vehicle && !(sessionError ?? error) && (loading || !vehicleId),
        error: sessionError ?? error,
    };
}
