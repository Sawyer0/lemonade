import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, Unsubscribe } from 'firebase/firestore';
import { db } from '@mobile/infrastructure/firebase/config';
import { convertTimestamps, Vehicle, DiagnosticSession } from '@lemonade/core';
import { MobileLogger } from '@mobile/services/MobileLogger';
import { useAuth } from '@mobile/context/AuthContext';

const logger = new MobileLogger();

export function useGarage() {
    const { user } = useAuth();
    const userId = user?.id;

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!userId) {
            // Defer state updates to avoid synchronous cascading render warning
            const timer = setTimeout(() => {
                if (isMountedRef.current) {
                    setVehicles((prev) => (prev.length === 0 ? prev : []));
                    setSessions((prev) => (prev.length === 0 ? prev : []));
                    setLoading((prev) => (prev === false ? prev : false));
                }
            }, 0);
            return () => clearTimeout(timer);
        }

        const subscriptions: Unsubscribe[] = [];

        // 1. Subscribe to Vehicles
        const vehiclesQuery = query(
            collection(db, 'vehicles'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc'),
        );

        const unsubVehicles = onSnapshot(
            vehiclesQuery,
            (snapshot) => {
                if (!isMountedRef.current) return;
                const vehiclesData: Vehicle[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    vehiclesData.push(convertTimestamps(data) as Vehicle);
                });
                setVehicles(vehiclesData);
            },
            (err) => {
                if (!isMountedRef.current) return;
                logger.error('Vehicles Subscription Error:', err);
                setError(err.message);
            },
        );
        subscriptions.push(unsubVehicles);

        // 2. Subscribe to Sessions
        const sessionsQuery = query(
            collection(db, 'sessions'),
            where('userId', '==', userId),
            orderBy('updatedAt', 'desc'),
        );

        const unsubSessions = onSnapshot(
            sessionsQuery,
            (snapshot) => {
                if (!isMountedRef.current) return;
                const sessionsData: DiagnosticSession[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    sessionsData.push(convertTimestamps(data) as DiagnosticSession);
                });
                setSessions(sessionsData);
                setLoading(false);
            },
            (err) => {
                if (!isMountedRef.current) return;
                logger.error('Sessions Subscription Error:', err);
                setError(err.message);
                setLoading(false);
            },
        );
        subscriptions.push(unsubSessions);

        return () => {
            subscriptions.forEach((unsub) => unsub());
        };
    }, [userId]);

    return { vehicles, sessions, loading, error };
}
