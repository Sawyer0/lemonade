import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/infrastructure/firebase/config';
import { DiagnosticSession } from '@/core/entities/DiagnosticSession';

interface LiveSessionState {
    session: DiagnosticSession | null;
    loading: boolean;
    status: 'idle' | 'uploading' | 'analyzing' | 'completed' | 'error';
    safetyAlert: string | null;
}

export function useLiveSession(sessionId: string): LiveSessionState {
    const [session, setSession] = useState<DiagnosticSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState<LiveSessionState['status']>('idle');
    const [safetyAlert, setSafetyAlert] = useState<string | null>(null);

    // Real-time Listener
    useEffect(() => {
        if (!sessionId) return;

        const unsub = onSnapshot(doc(db, 'sessions', sessionId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                // Helper to convert Firestore Timestamps to Dates
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const convertTimestamps = (obj: any): any => {
                    if (!obj) return obj;
                    if (typeof obj.toDate === 'function') return obj.toDate();
                    if (Array.isArray(obj)) return obj.map(convertTimestamps);
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

                const sessionData = convertTimestamps(data);

                // Update session data
                setSession(sessionData as DiagnosticSession);

                // Track status from Cloud Function
                if (sessionData.status) {
                    setStatus(sessionData.status as LiveSessionState['status']);
                }

                // IMMEDIATE SAFETY INTERVENTION
                if (sessionData.safety_stop && sessionData.safety_reason) {
                    setSafetyAlert(sessionData.safety_reason);
                }
            }
            setLoading(false);
        });

        return () => unsub();
    }, [sessionId]);

    return { session, loading, status, safetyAlert };
}
