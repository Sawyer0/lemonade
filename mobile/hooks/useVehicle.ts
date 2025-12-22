import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@mobile/infrastructure/firebase/config';
import { Vehicle } from '@lemonade/core';
import { convertTimestamps } from '@lemonade/core';

export function useVehicle(vehicleId: string | undefined) {
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!vehicleId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(false);
            return;
        }

        const unsub = onSnapshot(doc(db, 'vehicles', vehicleId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setVehicle(convertTimestamps(data) as Vehicle);
            } else {
                setError("Vehicle not found");
            }
            setLoading(false);
        }, (err) => {
            console.error("Vehicle Fetch Error:", err);
            setError(err.message);
            setLoading(false);
        });

        return () => unsub();
    }, [vehicleId]);

    return { vehicle, loading, error };
}
