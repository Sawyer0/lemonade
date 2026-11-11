/**
 * Lemonade brand tokens — the single source of truth for brand colors and type.
 *
 * Closes #44. Web (#45) and mobile (#46) consume these tokens; no brand color
 * or font family may be hardcoded anywhere else. If a color or font is needed
 * that is not here, add it here first.
 *
 * Direction (user, Nov 11, 2026): Quilt's approach, not Quilt's colors or
 * fonts. Blue, white, and orange in shades, not the pure colors. Light mode
 * is an off-white work order; dark mode is the shop at night in deep
 * blue-charcoal, with orange popping. State colors keep their hues and
 * meanings in both modes — deeper in light, brighter in dark.
 *
 * Fonts, evaluated against Baloo 2, Fredoka, and Rubik for prose/UI and
 * JetBrains Mono and Space Mono for data:
 * - Rubik won for prose/UI. Rounded terminals keep the friendly feel, but it
 *   is a sturdy grotesque with a full weight range and strong small-size
 *   legibility — a shop tool, not a toy. Fredoka reads younger and is weak at
 *   body sizes; Baloo 2 is a close second but its letterforms read younger
 *   and fight long UI text.
 * - JetBrains Mono won for data. Built for code and data legibility
 *   (distinct 0/O, 1/l/I) with a full weight range, so DTC codes, VINs, and
 *   torque values stay readable at small sizes. Space Mono has only two
 *   weights and its typewriter quirk hurts small-size code legibility.
 *
 * Contrast: every text color on every surface role (`background`, `surface`,
 * `surfaceRaised`) in both modes, plus the on-fill text colors, was checked
 * against WCAG AA (4.5:1 for normal text). Worst passing pair is the light
 * accent on the raised surface at 4.52:1. The soft tints are fills, not text
 * surfaces: pair `accentSoft` with `accentStrong` and `primarySoft` with
 * `primaryStrong`.
 * The `onPrimary`, `onAccent`, and `onStop` tokens are the only text colors
 * that may sit on a filled primary, accent, or stop surface.
 *
 * `info` deliberately aliases `primary` and `focusRing` deliberately aliases
 * `accent` in each mode: the info state and the focus ring are the brand
 * colors, not separate hues.
 */

export type HexColor = `#${string}`;

export interface ColorScheme {
    background: HexColor;
    surface: HexColor;
    surfaceRaised: HexColor;
    text: HexColor;
    textSecondary: HexColor;
    border: HexColor;
    primary: HexColor;
    primaryStrong: HexColor;
    primarySoft: HexColor;
    accent: HexColor;
    accentStrong: HexColor;
    accentSoft: HexColor;
    stop: HexColor;
    caution: HexColor;
    go: HexColor;
    info: HexColor;
    onPrimary: HexColor;
    onAccent: HexColor;
    onStop: HexColor;
    focusRing: HexColor;
}

export interface FontTokens {
    proseFamily: string;
    proseStack: string;
    proseWeights: readonly number[];
    dataFamily: string;
    dataStack: string;
    dataWeights: readonly number[];
}

export interface BrandTokens {
    light: ColorScheme;
    dark: ColorScheme;
    font: FontTokens;
}

export const BRAND_TOKENS: BrandTokens = {
    light: {
        background: '#FAF7F0',
        surface: '#FFFFFF',
        surfaceRaised: '#F4EFE6',
        text: '#16283C',
        textSecondary: '#52657A',
        border: '#D9DEE5',
        primary: '#1D4E89',
        primaryStrong: '#14365E',
        primarySoft: '#DCE7F3',
        accent: '#C2410C',
        accentStrong: '#9A3412',
        accentSoft: '#FDEBD9',
        stop: '#B91C1C',
        caution: '#92400E',
        go: '#166534',
        info: '#1D4E89',
        onPrimary: '#FFFFFF',
        onAccent: '#FFFFFF',
        onStop: '#FFFFFF',
        focusRing: '#C2410C',
    },
    dark: {
        background: '#0D1826',
        surface: '#152435',
        surfaceRaised: '#1D3046',
        text: '#F4F1EA',
        textSecondary: '#9DB0C3',
        border: '#2B3D52',
        primary: '#7FB3E8',
        primaryStrong: '#A9CFF2',
        primarySoft: '#1E3A5C',
        accent: '#FF9A4D',
        accentStrong: '#FFB37A',
        accentSoft: '#3D2410',
        stop: '#F87171',
        caution: '#FBBF24',
        go: '#4ADE80',
        info: '#7FB3E8',
        onPrimary: '#0D1826',
        onAccent: '#0D1826',
        onStop: '#0D1826',
        focusRing: '#FF9A4D',
    },
    font: {
        proseFamily: 'Rubik',
        proseStack: "'Rubik', 'Avenir Next', 'Segoe UI', system-ui, sans-serif",
        proseWeights: [400, 500, 600, 700, 800],
        dataFamily: 'JetBrains Mono',
        dataStack: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        dataWeights: [400, 500, 600, 700],
    },
};

export type ColorSchemeKey = keyof ColorScheme;

/** Browser chrome color; the light primary is the brand's public face. */
export const THEME_COLOR: HexColor = BRAND_TOKENS.light.primary;

/**
 * CSS custom property name for a color token, so web derives the names from
 * the same source instead of spelling them twice. Mobile reads the token
 * values directly from this module and does not use CSS custom properties.
 * `surfaceRaised` becomes `--lemonade-color-surface-raised`.
 */
export function colorTokenCssVariable(token: ColorSchemeKey): string {
    const kebab = token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return `--lemonade-color-${kebab}`;
}
