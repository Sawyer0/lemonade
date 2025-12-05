'use client';
import { use, useState, useEffect } from 'react';
import { useLiveSession } from '@/presentation/hooks/useLiveSession';
import { CameraWorkspace } from '@/presentation/components/workspace/CameraWorkspace';
import { useToast, useAuth } from '@/presentation/context';
import { auth } from '@/infrastructure/firebase/config';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { session, loading: sessionLoading } = useLiveSession(id);
    const { showToast } = useToast();
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
    // Message sending is handled by CameraWorkspace component via useChat hook
    // This function is kept for reference but not used directly
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleSendMessage = async (message: string) => {
        if (!session || !token) return;
        try {
            await fetch('/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ sessionId: session.id, message })
            });
        } catch {
            showToast('Failed to send message', 'error');
        }
    };

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
        <CameraWorkspace
            session={session}
            token={token}
        />
    );
}
