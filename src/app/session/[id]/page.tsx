'use client';
import { use, useState } from 'react';
import { useLiveSession } from '@/presentation/hooks/useLiveSession';
import { CameraWorkspace } from '@/presentation/components/workspace/CameraWorkspace';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { session, loading } = useLiveSession(id);

    const handleSendMessage = async (message: string) => {
        if (!session) return;
        try {
            await fetch('/api/chat/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: session.id, message })
            });
        } catch (err) {
            console.error("Failed to send message", err);
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
            onSendMessage={handleSendMessage}
        />
    );
}
