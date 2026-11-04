'use client';

import { App } from 'konsta/react';
import { useEffect, useState } from 'react';

import { CONFIG } from '@/infrastructure/config';

export function KonstaProvider({ children }: { children: React.ReactNode }) {
    // Use a sensible default (iOS) for server rendering to match our primary target
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsClient(true);
    }, []);

    if (!isClient) return null;

    return (
        <App theme={CONFIG.UI.THEME} safeAreas={true} dark={true}>
            {children}
        </App>
    );
}
