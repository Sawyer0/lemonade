'use client';
import { useState, useEffect } from 'react';

export function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        // Initial check
        const timer = setTimeout(() => {
            setIsOffline(!navigator.onLine);
        }, 0);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center py-2 px-4 z-50 font-bold text-sm">
            ⚠️ You are offline. Some features may be unavailable.
        </div>
    );
}
