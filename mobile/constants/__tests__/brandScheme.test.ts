import {
    BRAND_COLOR_SCHEME_STORAGE_KEY,
    isBrandColorSchemeMode,
    nextBrandColorSchemeMode,
    resolveBrandColorScheme,
} from '../brandScheme';

describe('resolveBrandColorScheme', () => {
    it('returns the stored scheme when the mode is light or dark', () => {
        expect(resolveBrandColorScheme('light', 'dark')).toBe('light');
        expect(resolveBrandColorScheme('dark', 'light')).toBe('dark');
    });

    it('follows the OS preference when the mode is system', () => {
        expect(resolveBrandColorScheme('system', 'light')).toBe('light');
        expect(resolveBrandColorScheme('system', 'dark')).toBe('dark');
    });

    it('falls back to light when the mode is system and the OS reports nothing', () => {
        expect(resolveBrandColorScheme('system', null)).toBe('light');
    });
});

describe('isBrandColorSchemeMode', () => {
    it('accepts light, dark, and system', () => {
        expect(isBrandColorSchemeMode('light')).toBe(true);
        expect(isBrandColorSchemeMode('dark')).toBe(true);
        expect(isBrandColorSchemeMode('system')).toBe(true);
    });

    it('rejects anything else, including null and garbage strings', () => {
        expect(isBrandColorSchemeMode(null)).toBe(false);
        expect(isBrandColorSchemeMode(undefined)).toBe(false);
        expect(isBrandColorSchemeMode('banana')).toBe(false);
        expect(isBrandColorSchemeMode('')).toBe(false);
        expect(isBrandColorSchemeMode(0)).toBe(false);
    });
});

describe('nextBrandColorSchemeMode', () => {
    it('cycles light -> dark -> system -> light', () => {
        expect(nextBrandColorSchemeMode('light')).toBe('dark');
        expect(nextBrandColorSchemeMode('dark')).toBe('system');
        expect(nextBrandColorSchemeMode('system')).toBe('light');
    });
});

describe('BRAND_COLOR_SCHEME_STORAGE_KEY', () => {
    it('is a namespaced key', () => {
        expect(BRAND_COLOR_SCHEME_STORAGE_KEY).toBe('lemonade:color-scheme-mode');
    });
});
