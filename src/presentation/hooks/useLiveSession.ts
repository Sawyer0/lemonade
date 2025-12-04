import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/infrastructure/firebase/config';
import { DiagnosticSession } from '@/core/types/models';

export function useLiveSession(sessionId: string) {
    const [session, setSession] = useState<DiagnosticSession | null>(null);
    const [loading, setLoading] = useState(true);

    // Real-time Listener
    // This is one of the few places where useEffect is absolutely necessary
    // to manage the WebSocket subscription lifecycle.
    useEffect(() => {
        if (!sessionId) return;

        const unsub = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
            if (doc.exists()) {
                // We cast here because we trust our write schema, 
                // but in a stricter app we might parse with Zod again.
                setSession(doc.data() as DiagnosticSession);
            }
            setLoading(false);
        });

        return () => unsub();
    }, [sessionId]);

    return { session, loading };
}
