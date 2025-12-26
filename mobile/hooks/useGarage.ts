import { useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { convertTimestamps, Vehicle, DiagnosticSession } from '@lemonade/core';
import { MobileLogger } from '@mobile/services/MobileLogger';

export function useGarage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const logger = useMemo(() => new MobileLogger(), []);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            requestAnimationFrame(() => {
                setLoading(false);
            });
            return;
        }

        // 1. Subscribe to Vehicles
        const vehiclesQuery = query(
            collection(db, 'vehicles'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubVehicles = onSnapshot(vehiclesQuery, (snapshot) => {
            const vehiclesData: Vehicle[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                vehiclesData.push(convertTimestamps(data) as Vehicle);
            });
            setVehicles(vehiclesData);
        }, (err) => {
            logger.error("Vehicles Subscription Error:", err);
            setError(err.message);
        });

        // 2. Subscribe to Sessions (Latest 20)
        const sessionsQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc')
        );

        const unsubSessions = onSnapshot(sessionsQuery, (snapshot) => {
            const sessionsData: DiagnosticSession[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                sessionsData.push(convertTimestamps(data) as DiagnosticSession);
            });
            setSessions(sessionsData);
            setLoading(false);
        }, (err) => {
            logger.error("Sessions Subscription Error:", err);
            setError(err.message);
            setLoading(false);
        });

        return () => {
            unsubVehicles();
            unsubSessions();
        };
    }, [logger]);

    return { vehicles, sessions, loading, error };
}