/**
 * Lemonade Brand Theme — derived from the brand tokens, the single source
 * of truth for brand colors (packages/core/src/config/brandTokens.ts).
 * No brand color may be hardcoded here.
 *
 * Both schemes are mapped: `Colors.light` is the light token set,
 * `Colors.dark` the dark token set. Components read the scheme the app
 * renders in through the `useBrandColors` hook, so a mode change
 * re-renders them in the other scheme; nothing here is static.
 *
 * Legacy key mapping (kept so existing consumers work unchanged):
 * tint is the action accent, card is the surface, gradientStart/gradientEnd
 * are the primary-to-accent gradient, success/error/warning are the go/stop/
 * caution states, and the *Soft tints are the washed backgrounds for badges
 * and error boxes. The plain token names surface, primary, and stop are
 * also exposed, so new code can use the token names directly instead of
 * the legacy aliases.
 */
import { BRAND_TOKENS, type ColorScheme } from '@lemonade/core';

function toLegacyColors(scheme: ColorScheme) {
    return {
        text: scheme.text,
        textSecondary: scheme.textSecondary,
        background: scheme.background,
        tint: scheme.accent,
        icon: scheme.text,
        tabIconDefault: scheme.textSecondary,
        tabIconSelected: scheme.accent,
        card: scheme.surface,
        surface: scheme.surface,
        primary: scheme.primary,
        stop: scheme.stop,
        surfaceRaised: scheme.surfaceRaised,
        border: scheme.border,
        gradientStart: scheme.primary,
        gradientEnd: scheme.accent,
        primarySoft: scheme.primarySoft,
        accentSoft: scheme.accentSoft,
        stopSoft: scheme.stopSoft,
        goSoft: scheme.goSoft,
        cautionSoft: scheme.cautionSoft,
        primaryStrong: scheme.primaryStrong,
        accentStrong: scheme.accentStrong,
        onPrimary: scheme.onPrimary,
        onAccent: scheme.onAccent,
        success: scheme.go,
        error: scheme.stop,
        warning: scheme.caution,
    };
}

export const Colors = {
    light: toLegacyColors(BRAND_TOKENS.light),
    dark: toLegacyColors(BRAND_TOKENS.dark),
};

export type ThemeColors = ReturnType<typeof toLegacyColors>;
