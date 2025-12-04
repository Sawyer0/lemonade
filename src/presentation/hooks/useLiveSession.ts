import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/infrastructure/firebase/config';
import { DiagnosticSession } from '@/core/types/models';

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
    // This is one of the few places where useEffect is absolutely necessary
    // to manage the WebSocket subscription lifecycle.
    useEffect(() => {
        if (!sessionId) return;

        const unsub = onSnapshot(doc(db, 'sessions', sessionId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                // Update session data
                setSession(data as DiagnosticSession);

                // Track status from Cloud Function
                if (data.status) {
                    setStatus(data.status as LiveSessionState['status']);
                }

                // IMMEDIATE SAFETY INTERVENTION
                // If the Cloud Function flags danger, we override the UI immediately.
                if (data.safety_stop && data.safety_reason) {
                    setSafetyAlert(data.safety_reason);
                }
            }
            setLoading(false);
        });

        return () => unsub();
    }, [sessionId]);

    return { session, loading, status, safetyAlert };
}
