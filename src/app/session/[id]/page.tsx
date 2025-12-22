'use client';
import { use, useState, useEffect } from 'react';
import { useLiveSession } from '@/presentation/hooks/useLiveSession';
import { SessionWorkspace } from '@/presentation/components/workspace/SessionWorkspace';
import { useToast, useAuth } from '@/presentation/context';
import { db } from '@/infrastructure/firebase/config';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { session, loading: sessionLoading } = useLiveSession(id, db);
    const { } = useToast();
    const { user, loading: authLoading } = useAuth();
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            user.getIdToken()
                .then(setToken)
                .catch((error) => {
                    console.error('Failed to get ID token:', error);
                    setToken(null);
                });
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setToken(null);
        }
    }, [user]);

    if (sessionLoading || authLoading || !token) {
        return (
            <div className="h-screen w-full bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                    <p className="text-zinc-500">Initializing secure session...</p>
                </div>
            </div>
        );
    }

    if (!session) {
        return (
            <div className="h-screen w-full bg-black flex items-center justify-center text-white">
                <h1>Session Not Found</h1>
            </div>
        );
    }

    return (
        <SessionWorkspace
            session={session}
            token={token}
        />
    );
}
