import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { Vehicle } from '@lemonade/core';
import { convertTimestamps } from '@lemonade/core';

export function useVehicle(vehicleId?: string) {
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [loading, setLoading] = useState(!!vehicleId);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!vehicleId) return;

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

    const onboardVehicle = async (vin: string, userId: string): Promise<Vehicle> => {
        setLoading(true);
        setError(null);
        try {
            const idToken = await auth.currentUser?.getIdToken();
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            
            const response = await fetch(`${API_URL}/api/vehicles/scan`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ vin, userId })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to onboard vehicle');
            }

            const { data } = await response.json();
            return data as Vehicle;
        } catch (err: any) {
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    return { vehicle, onboardVehicle, loading, error };
}