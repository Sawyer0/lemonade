/**
 * The color scheme the mobile app renders in, and how it is chosen.
 *
 * The mode is the user's stored setting ('light', 'dark', or 'system');
 * 'system' means the OS preference decides. The resolved scheme is what
 * every token-driven surface renders in. These are pure functions, so the
 * choice is unit-testable without React or storage.
 *
 * Storage: the mode persists in AsyncStorage under
 * BRAND_COLOR_SCHEME_STORAGE_KEY; the provider in
 * components/providers/brandColorScheme.tsx owns the read and write.
 */

export type BrandColorSchemeMode = 'light' | 'dark' | 'system';

export type BrandColorScheme = 'light' | 'dark';

export const BRAND_COLOR_SCHEME_STORAGE_KEY = 'lemonade:color-scheme-mode';

export function resolveBrandColorScheme(
    mode: BrandColorSchemeMode,
    systemScheme: BrandColorScheme | null,
): BrandColorScheme {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }
    return systemScheme ?? 'light';
}

export function isBrandColorSchemeMode(value: unknown): value is BrandColorSchemeMode {
    return value === 'light' || value === 'dark' || value === 'system';
}

/** The next mode in the toggle cycle: light -> dark -> system -> light. */
export function nextBrandColorSchemeMode(mode: BrandColorSchemeMode): BrandColorSchemeMode {
    if (mode === 'light') {
        return 'dark';
    }
    if (mode === 'dark') {
        return 'system';
    }
    return 'light';
}
