import { useEffect, useState } from 'react';
import { doc, onSnapshot, Firestore } from 'firebase/firestore';
import { DiagnosticSession, convertTimestamps } from '@lemonade/core';

interface LiveSessionState {
    session: DiagnosticSession | null;
    loading: boolean;
    status: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
    safetyAlert: string | null;
}

export function useLiveSession(sessionId: string, db: Firestore): LiveSessionState {
    const [session, setSession] = useState<DiagnosticSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<LiveSessionState['status']>('idle');
    const [safetyAlert, setSafetyAlert] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId || !db) return;

        const unsub = onSnapshot(doc(db, 'sessions', sessionId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const sessionData = convertTimestamps(data);
                setSession(sessionData as DiagnosticSession);
                if (sessionData.status) {
                    setStatus(sessionData.status as LiveSessionState['status']);
                }
                if (sessionData.safety_stop && sessionData.safety_reason) {
                    setSafetyAlert(sessionData.safety_reason);
                }
            }
            setLoading(false);
        });

        return () => unsub();
    }, [sessionId, db]);

    return { session, loading, status, safetyAlert };
}
