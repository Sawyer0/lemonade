'use client';
import { use } from 'react';
import { useLiveSession } from '@/presentation/hooks/useLiveSession';
import { CameraWorkspace } from '@/presentation/components/workspace/CameraWorkspace';
import { useToast } from '@/presentation/components/ui/Toast';
import { auth } from '@/infrastructure/firebase/config';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { session, loading } = useLiveSession(id);
    const { showToast } = useToast();

    // Message sending is handled by CameraWorkspace component via useChat hook
    // This function is kept for reference but not used directly
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleSendMessage = async (message: string) => {
        if (!session) return;
        try {
            const token = await auth.currentUser?.getIdToken();
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

    if (loading) {
        return (
            <div className="h-screen w-full bg-black flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
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
        />
    );
}
