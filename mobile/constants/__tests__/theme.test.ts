import { BRAND_TOKENS } from '@lemonade/core';
import { Colors } from '../theme';

/**
 * The legacy color map must be a pure projection of the brand tokens:
 * light maps to the light tokens, dark to the dark tokens, and no
 * hardcoded color may live here.
 */
describe('theme Colors', () => {
    it('maps light to the light tokens', () => {
        expect(Colors.light.text).toBe(BRAND_TOKENS.light.text);
        expect(Colors.light.textSecondary).toBe(BRAND_TOKENS.light.textSecondary);
        expect(Colors.light.background).toBe(BRAND_TOKENS.light.background);
        expect(Colors.light.tint).toBe(BRAND_TOKENS.light.accent);
        expect(Colors.light.icon).toBe(BRAND_TOKENS.light.text);
        expect(Colors.light.card).toBe(BRAND_TOKENS.light.surface);
        expect(Colors.light.surface).toBe(BRAND_TOKENS.light.surface);
        expect(Colors.light.primary).toBe(BRAND_TOKENS.light.primary);
        expect(Colors.light.stop).toBe(BRAND_TOKENS.light.stop);
        expect(Colors.light.surfaceRaised).toBe(BRAND_TOKENS.light.surfaceRaised);
        expect(Colors.light.border).toBe(BRAND_TOKENS.light.border);
        expect(Colors.light.gradientStart).toBe(BRAND_TOKENS.light.primary);
        expect(Colors.light.gradientEnd).toBe(BRAND_TOKENS.light.accent);
        expect(Colors.light.primarySoft).toBe(BRAND_TOKENS.light.primarySoft);
        expect(Colors.light.accentSoft).toBe(BRAND_TOKENS.light.accentSoft);
        expect(Colors.light.stopSoft).toBe(BRAND_TOKENS.light.stopSoft);
        expect(Colors.light.goSoft).toBe(BRAND_TOKENS.light.goSoft);
        expect(Colors.light.cautionSoft).toBe(BRAND_TOKENS.light.cautionSoft);
        expect(Colors.light.primaryStrong).toBe(BRAND_TOKENS.light.primaryStrong);
        expect(Colors.light.accentStrong).toBe(BRAND_TOKENS.light.accentStrong);
        expect(Colors.light.onPrimary).toBe(BRAND_TOKENS.light.onPrimary);
        expect(Colors.light.onAccent).toBe(BRAND_TOKENS.light.onAccent);
        expect(Colors.light.success).toBe(BRAND_TOKENS.light.go);
        expect(Colors.light.error).toBe(BRAND_TOKENS.light.stop);
        expect(Colors.light.warning).toBe(BRAND_TOKENS.light.caution);
    });

    it('maps dark to the dark tokens', () => {
        expect(Colors.dark.text).toBe(BRAND_TOKENS.dark.text);
        expect(Colors.dark.textSecondary).toBe(BRAND_TOKENS.dark.textSecondary);
        expect(Colors.dark.background).toBe(BRAND_TOKENS.dark.background);
        expect(Colors.dark.tint).toBe(BRAND_TOKENS.dark.accent);
        expect(Colors.dark.icon).toBe(BRAND_TOKENS.dark.text);
        expect(Colors.dark.card).toBe(BRAND_TOKENS.dark.surface);
        expect(Colors.dark.surface).toBe(BRAND_TOKENS.dark.surface);
        expect(Colors.dark.primary).toBe(BRAND_TOKENS.dark.primary);
        expect(Colors.dark.stop).toBe(BRAND_TOKENS.dark.stop);
        expect(Colors.dark.surfaceRaised).toBe(BRAND_TOKENS.dark.surfaceRaised);
        expect(Colors.dark.border).toBe(BRAND_TOKENS.dark.border);
        expect(Colors.dark.gradientStart).toBe(BRAND_TOKENS.dark.primary);
        expect(Colors.dark.gradientEnd).toBe(BRAND_TOKENS.dark.accent);
        expect(Colors.dark.primarySoft).toBe(BRAND_TOKENS.dark.primarySoft);
        expect(Colors.dark.accentSoft).toBe(BRAND_TOKENS.dark.accentSoft);
        expect(Colors.dark.stopSoft).toBe(BRAND_TOKENS.dark.stopSoft);
        expect(Colors.dark.goSoft).toBe(BRAND_TOKENS.dark.goSoft);
        expect(Colors.dark.cautionSoft).toBe(BRAND_TOKENS.dark.cautionSoft);
        expect(Colors.dark.primaryStrong).toBe(BRAND_TOKENS.dark.primaryStrong);
        expect(Colors.dark.accentStrong).toBe(BRAND_TOKENS.dark.accentStrong);
        expect(Colors.dark.onPrimary).toBe(BRAND_TOKENS.dark.onPrimary);
        expect(Colors.dark.onAccent).toBe(BRAND_TOKENS.dark.onAccent);
        expect(Colors.dark.success).toBe(BRAND_TOKENS.dark.go);
        expect(Colors.dark.error).toBe(BRAND_TOKENS.dark.stop);
        expect(Colors.dark.warning).toBe(BRAND_TOKENS.dark.caution);
    });

    it('keeps light and dark schemes distinct', () => {
        expect(Colors.light.background).not.toBe(Colors.dark.background);
        expect(Colors.light.text).not.toBe(Colors.dark.text);
        expect(Colors.light.card).not.toBe(Colors.dark.card);
    });
});
