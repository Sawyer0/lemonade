'use client';

import { App } from 'konsta/react';

import { CONFIG } from '@/infrastructure/config';

// LM-06: this provider renders its children on the server too. It used to
// return null until a client-side effect fired, which meant NO page in the
// app ever server-rendered any content — a raw-HTML fetch saw only the
// shell, so the report smoke test could never see the report chrome. That
// gate is safe to drop: the theme is pinned to 'ios' in CONFIG (deliberately,
// to avoid a hydration mismatch), and Konsta's App reads no browser globals
// during render — its theme detection runs in an effect and is a no-op for
// a pinned theme — so the server render and the first client render match.
export function KonstaProvider({ children }: { children: React.ReactNode }) {
    return (
        <App theme={CONFIG.UI.THEME} safeAreas={true} dark={true}>
            {children}
        </App>
    );
}
