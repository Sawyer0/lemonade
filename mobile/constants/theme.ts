/**
 * Lemonade Brand Theme — derived from the brand tokens, the single source
 * of truth for brand colors (packages/core/src/config/brandTokens.ts).
 * No brand color may be hardcoded here.
 *
 * Both schemes map to the dark token set for now: the app is dark-only
 * until #46 wires the light scheme and the mode toggle.
 *
 * Legacy key mapping (kept so existing consumers work unchanged):
 * tint is the action accent, card is the surface, gradientStart/gradientEnd
 * are the primary-to-accent gradient, success/error/warning are the go/stop/
 * caution states, and the *Soft tints are the washed backgrounds for badges
 * and error boxes.
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
    light: toLegacyColors(BRAND_TOKENS.dark),
    dark: toLegacyColors(BRAND_TOKENS.dark),
};

// The app is dark-only until #46 adds the mode toggle.
export const Theme = Colors.dark;
