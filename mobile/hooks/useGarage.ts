import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '@/infrastructure/firebase/config';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';

export function useGarage() {
    const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            setLoading(false);
            return;
        }

        // Query sessions for the current user, ordered by most recent
        const q = query(
            collection(db, 'sessions'),
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc')
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const sessionsData: DiagnosticSession[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Helper to convert Timestamps
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const convertTimestamps = (obj: any): any => {
                    if (!obj) return obj;
                    if (typeof obj.toDate === 'function') return obj.toDate();
                    if (typeof obj === 'object') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const result: any = {};
                        for (const key in obj) {
                            result[key] = convertTimestamps(obj[key]);
                        }
                        return result;
                    }
                    return obj;
                };
                sessionsData.push(convertTimestamps(data) as DiagnosticSession);
            });
            setSessions(sessionsData);
            setLoading(false);
        }, (err) => {
            console.error("Garage Subscription Error:", err);
            setError(err.message);
            setLoading(false);
        });

        return () => unsub();
    }, []);

    return { sessions, loading, error };
}
