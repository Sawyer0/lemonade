import { BRAND_TOKENS } from '@lemonade/core';
import { paperThemeDark, paperThemeLight } from '../paperTheme';

/**
 * The Paper theme must be a pure projection of the brand tokens: no
 * hardcoded brand color may live outside brandTokens.ts. Every role
 * asserted here is a token value, so a token change flows through and
 * a hardcoded color here fails the test.
 */
describe('paperTheme', () => {
    it('maps the light scheme from the light tokens', () => {
        const { colors } = paperThemeLight;
        expect(colors.primary).toBe(BRAND_TOKENS.light.primary);
        expect(colors.onPrimary).toBe(BRAND_TOKENS.light.onPrimary);
        expect(colors.primaryContainer).toBe(BRAND_TOKENS.light.primarySoft);
        expect(colors.onPrimaryContainer).toBe(BRAND_TOKENS.light.primaryStrong);
        expect(colors.secondary).toBe(BRAND_TOKENS.light.accent);
        expect(colors.onSecondary).toBe(BRAND_TOKENS.light.onAccent);
        expect(colors.secondaryContainer).toBe(BRAND_TOKENS.light.accentSoft);
        expect(colors.onSecondaryContainer).toBe(BRAND_TOKENS.light.accentStrong);
        expect(colors.tertiary).toBe(BRAND_TOKENS.light.go);
        expect(colors.onTertiary).toBe(BRAND_TOKENS.light.onPrimary);
        expect(colors.tertiaryContainer).toBe(BRAND_TOKENS.light.goSoft);
        expect(colors.onTertiaryContainer).toBe(BRAND_TOKENS.light.go);
        expect(colors.error).toBe(BRAND_TOKENS.light.stop);
        expect(colors.onError).toBe(BRAND_TOKENS.light.onStop);
        expect(colors.errorContainer).toBe(BRAND_TOKENS.light.stopSoft);
        expect(colors.onErrorContainer).toBe(BRAND_TOKENS.light.stop);
        expect(colors.background).toBe(BRAND_TOKENS.light.background);
        expect(colors.surface).toBe(BRAND_TOKENS.light.surface);
        expect(colors.surfaceVariant).toBe(BRAND_TOKENS.light.surfaceRaised);
        expect(colors.onSurface).toBe(BRAND_TOKENS.light.text);
        expect(colors.onSurfaceVariant).toBe(BRAND_TOKENS.light.textSecondary);
        expect(colors.outline).toBe(BRAND_TOKENS.light.border);
        expect(colors.inverseSurface).toBe(BRAND_TOKENS.light.primaryStrong);
        expect(colors.inverseOnSurface).toBe(BRAND_TOKENS.light.onPrimary);
    });

    it('maps the dark scheme from the dark tokens', () => {
        const { colors } = paperThemeDark;
        expect(colors.primary).toBe(BRAND_TOKENS.dark.primary);
        expect(colors.onPrimary).toBe(BRAND_TOKENS.dark.onPrimary);
        expect(colors.primaryContainer).toBe(BRAND_TOKENS.dark.primarySoft);
        expect(colors.onPrimaryContainer).toBe(BRAND_TOKENS.dark.primaryStrong);
        expect(colors.secondary).toBe(BRAND_TOKENS.dark.accent);
        expect(colors.onSecondary).toBe(BRAND_TOKENS.dark.onAccent);
        expect(colors.secondaryContainer).toBe(BRAND_TOKENS.dark.accentSoft);
        expect(colors.onSecondaryContainer).toBe(BRAND_TOKENS.dark.accentStrong);
        expect(colors.tertiary).toBe(BRAND_TOKENS.dark.go);
        expect(colors.onTertiary).toBe(BRAND_TOKENS.dark.onPrimary);
        expect(colors.tertiaryContainer).toBe(BRAND_TOKENS.dark.goSoft);
        expect(colors.onTertiaryContainer).toBe(BRAND_TOKENS.dark.go);
        expect(colors.error).toBe(BRAND_TOKENS.dark.stop);
        expect(colors.onError).toBe(BRAND_TOKENS.dark.onStop);
        expect(colors.errorContainer).toBe(BRAND_TOKENS.dark.stopSoft);
        expect(colors.onErrorContainer).toBe(BRAND_TOKENS.dark.stop);
        expect(colors.background).toBe(BRAND_TOKENS.dark.background);
        expect(colors.surface).toBe(BRAND_TOKENS.dark.surface);
        expect(colors.surfaceVariant).toBe(BRAND_TOKENS.dark.surfaceRaised);
        expect(colors.onSurface).toBe(BRAND_TOKENS.dark.text);
        expect(colors.onSurfaceVariant).toBe(BRAND_TOKENS.dark.textSecondary);
        expect(colors.outline).toBe(BRAND_TOKENS.dark.border);
        expect(colors.inverseSurface).toBe(BRAND_TOKENS.dark.text);
        expect(colors.inverseOnSurface).toBe(BRAND_TOKENS.dark.background);
    });

    it('uses the brand typefaces on both schemes', () => {
        expect(paperThemeLight.fonts.bodyLarge.fontFamily).toBe('Rubik_400Regular');
        expect(paperThemeLight.fonts.labelLarge.fontFamily).toBe('Rubik_600SemiBold');
        expect(paperThemeLight.fonts.displayLarge.fontFamily).toBe('Rubik_700Bold');
        expect(paperThemeDark.fonts.bodyLarge.fontFamily).toBe('Rubik_400Regular');
        expect(paperThemeDark.fonts.labelLarge.fontFamily).toBe('Rubik_600SemiBold');
        expect(paperThemeDark.fonts.displayLarge.fontFamily).toBe('Rubik_700Bold');
    });

    it('keeps light and dark schemes distinct', () => {
        expect(paperThemeLight.dark).toBe(false);
        expect(paperThemeDark.dark).toBe(true);
        expect(paperThemeLight.colors.background).not.toBe(paperThemeDark.colors.background);
        expect(paperThemeLight.colors.primary).not.toBe(paperThemeDark.colors.primary);
    });
});
