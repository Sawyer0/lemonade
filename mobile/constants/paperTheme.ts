/**
 * Material 3 theme for Android, built from the brand tokens.
 *
 * Every brand color in the Paper theme comes from
 * `packages/core/src/config/brandTokens.ts`; no brand color is hardcoded
 * here. Roles with no brand-token equivalent (shadow, scrim, backdrop,
 * disabled states) keep Paper's own Material defaults — they are
 * Material's neutrals, not Lemonade brand colors.
 *
 * Mapping:
 * - primary family <- tokens.primary (+Strong on Soft for containers)
 * - secondary family <- tokens.accent
 * - tertiary family <- tokens.go: the success color doubles as the third
 *   accent so status indicators can read it from the theme
 * - error family <- tokens.stop, with tokens.stopSoft as the container
 * - surfaces and text <- tokens.background/surface/surfaceRaised/text
 * - outline <- tokens.border
 * - inverse roles flip the scheme: inverseSurface is the dark primary
 *   in light mode and the light text in dark mode, so a Snackbar stays
 *   readable in both modes; inversePrimary is the light primary in dark
 *   mode and the primary tint in light mode.
 * - roundness 12 matches the app's rounded cards and buttons.
 *
 * The provider uses the dark scheme until #46 adds the light scheme and
 * the mode toggle; both schemes are mapped here so the toggle only has
 * to switch the argument.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { BRAND_TOKENS, type ColorScheme } from '@lemonade/core';
import { JETBRAINS_MONO_FAMILY, RUBIK_FAMILY } from './brandFonts';

export type PaperColorScheme = 'light' | 'dark';

function buildFonts(): MD3Theme['fonts'] {
    const base = MD3LightTheme.fonts;
    return {
        displayLarge: { ...base.displayLarge, fontFamily: RUBIK_FAMILY.bold, fontWeight: '700' },
        displayMedium: { ...base.displayMedium, fontFamily: RUBIK_FAMILY.bold, fontWeight: '700' },
        displaySmall: { ...base.displaySmall, fontFamily: RUBIK_FAMILY.bold, fontWeight: '700' },
        headlineLarge: { ...base.headlineLarge, fontFamily: RUBIK_FAMILY.bold, fontWeight: '700' },
        headlineMedium: { ...base.headlineMedium, fontFamily: RUBIK_FAMILY.semiBold, fontWeight: '600' },
        headlineSmall: { ...base.headlineSmall, fontFamily: RUBIK_FAMILY.semiBold, fontWeight: '600' },
        titleLarge: { ...base.titleLarge, fontFamily: RUBIK_FAMILY.semiBold, fontWeight: '600' },
        titleMedium: { ...base.titleMedium, fontFamily: RUBIK_FAMILY.medium, fontWeight: '500' },
        titleSmall: { ...base.titleSmall, fontFamily: RUBIK_FAMILY.medium, fontWeight: '500' },
        bodyLarge: { ...base.bodyLarge, fontFamily: RUBIK_FAMILY.regular, fontWeight: '400' },
        bodyMedium: { ...base.bodyMedium, fontFamily: RUBIK_FAMILY.medium, fontWeight: '500' },
        bodySmall: { ...base.bodySmall, fontFamily: RUBIK_FAMILY.regular, fontWeight: '400' },
        labelLarge: { ...base.labelLarge, fontFamily: RUBIK_FAMILY.semiBold, fontWeight: '600' },
        labelMedium: { ...base.labelMedium, fontFamily: RUBIK_FAMILY.medium, fontWeight: '500' },
        labelSmall: { ...base.labelSmall, fontFamily: RUBIK_FAMILY.medium, fontWeight: '500' },
        default: { ...base.default, fontFamily: RUBIK_FAMILY.regular, fontWeight: '400' },
    };
}

export function buildPaperTheme(scheme: PaperColorScheme): MD3Theme {
    const tokens: ColorScheme = BRAND_TOKENS[scheme];
    const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
    return {
        ...base,
        roundness: 12,
        colors: {
            ...base.colors,
            primary: tokens.primary,
            onPrimary: tokens.onPrimary,
            primaryContainer: tokens.primarySoft,
            onPrimaryContainer: tokens.primaryStrong,
            secondary: tokens.accent,
            onSecondary: tokens.onAccent,
            secondaryContainer: tokens.accentSoft,
            onSecondaryContainer: tokens.accentStrong,
            tertiary: tokens.go,
            onTertiary: tokens.onPrimary,
            tertiaryContainer: tokens.goSoft,
            onTertiaryContainer: tokens.go,
            error: tokens.stop,
            onError: tokens.onStop,
            errorContainer: tokens.stopSoft,
            onErrorContainer: tokens.stop,
            background: tokens.background,
            onBackground: tokens.text,
            surface: tokens.surface,
            onSurface: tokens.text,
            surfaceVariant: tokens.surfaceRaised,
            onSurfaceVariant: tokens.textSecondary,
            outline: tokens.border,
            outlineVariant: tokens.border,
            inverseSurface: scheme === 'dark' ? tokens.text : tokens.primaryStrong,
            inverseOnSurface: scheme === 'dark' ? tokens.background : tokens.onPrimary,
            inversePrimary: scheme === 'dark' ? BRAND_TOKENS.light.primary : tokens.primarySoft,
            elevation: {
                ...base.colors.elevation,
                level0: tokens.surface,
                level1: tokens.surfaceRaised,
                level2: tokens.surfaceRaised,
                level3: tokens.surfaceRaised,
                level4: tokens.surfaceRaised,
                level5: tokens.surfaceRaised,
            },
        },
        fonts: buildFonts(),
    };
}

/** Data text (DTC codes, VINs, readings) renders in JetBrains Mono. */
export function monoFontFamily(weight: keyof typeof JETBRAINS_MONO_FAMILY): string {
    return JETBRAINS_MONO_FAMILY[weight];
}

/** Prebuilt schemes; the provider picks one (dark until #46 adds the toggle). */
export const paperThemeLight: MD3Theme = buildPaperTheme('light');
export const paperThemeDark: MD3Theme = buildPaperTheme('dark');
