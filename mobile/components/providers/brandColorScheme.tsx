import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@mobile/hooks/use-color-scheme';
import {
    BRAND_COLOR_SCHEME_STORAGE_KEY,
    isBrandColorSchemeMode,
    resolveBrandColorScheme,
    type BrandColorScheme,
    type BrandColorSchemeMode,
} from '@mobile/constants/brandScheme';

export interface BrandColorSchemeState {
    /** The scheme the app renders in right now. */
    scheme: BrandColorScheme;
    /** The stored setting; 'system' means the OS preference decides. */
    mode: BrandColorSchemeMode;
    /** Persist the mode and re-render in the new scheme. */
    setMode: (mode: BrandColorSchemeMode) => Promise<void>;
}

const BrandColorSchemeContext = createContext<BrandColorSchemeState | null>(null);

/**
 * Owns the app color scheme: the stored mode (AsyncStorage) resolved
 * against the OS preference. While the stored mode loads, the OS
 * preference decides, so first paint never waits on storage.
 */
export function BrandColorSchemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [mode, setModeState] = useState<BrandColorSchemeMode>('system');

    useEffect(() => {
        let cancelled = false;
        AsyncStorage.getItem(BRAND_COLOR_SCHEME_STORAGE_KEY)
            .then((stored) => {
                if (!cancelled && isBrandColorSchemeMode(stored)) {
                    setModeState(stored);
                }
            })
            .catch((error: unknown) => {
                console.error('Failed to read stored color scheme; using system preference', error);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const setMode = useCallback(async (next: BrandColorSchemeMode) => {
        setModeState(next);
        try {
            await AsyncStorage.setItem(BRAND_COLOR_SCHEME_STORAGE_KEY, next);
        } catch (error: unknown) {
            console.error('Failed to persist color scheme', error);
        }
    }, []);

    const value = useMemo<BrandColorSchemeState>(
        () => ({ scheme: resolveBrandColorScheme(mode, systemScheme ?? null), mode, setMode }),
        [mode, systemScheme, setMode],
    );

    return <BrandColorSchemeContext.Provider value={value}>{children}</BrandColorSchemeContext.Provider>;
}

/**
 * The resolved scheme and the stored setting. Outside a provider (tests,
 * standalone renders) it falls back to the OS preference with mode
 * 'system', so components are safe anywhere.
 */
export function useBrandColorScheme(): BrandColorSchemeState {
    const context = useContext(BrandColorSchemeContext);
    const systemScheme = useColorScheme();
    const fallback = useMemo<BrandColorSchemeState>(
        () => ({ scheme: systemScheme ?? 'light', mode: 'system', setMode: async () => {} }),
        [systemScheme],
    );
    return context ?? fallback;
}
