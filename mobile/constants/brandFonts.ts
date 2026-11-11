/**
 * Brand font families, as registered by expo-font when the Google Fonts
 * packages load (see useBrandFonts). The family names carry their weight
 * because @expo-google-fonts registers one family per weight.
 *
 * The families come from the brand tokens (Rubik for prose/UI, JetBrains
 * Mono for data); the weight-specific names here are the loading-time
 * spelling of those families.
 */

export const RUBIK_FAMILY = {
    regular: 'Rubik_400Regular',
    medium: 'Rubik_500Medium',
    semiBold: 'Rubik_600SemiBold',
    bold: 'Rubik_700Bold',
} as const;

export const JETBRAINS_MONO_FAMILY = {
    regular: 'JetBrainsMono_400Regular',
    medium: 'JetBrainsMono_500Medium',
    bold: 'JetBrainsMono_700Bold',
} as const;
