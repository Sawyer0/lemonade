import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { convertTimestamps } from '@infrastructure/firestore/timestamps';
import { DiagnosticSession } from '@lemonade/core';

export function useGarage() {
    const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
