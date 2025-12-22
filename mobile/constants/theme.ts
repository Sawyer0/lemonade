/**
 * Lemonade Brand Theme
 * Matches the Web App's aesthetic:
 * - Background: Deep Black
 * - Accents: Yellow-400 to Orange-500 Gradient
 * - Cards: Zinc-900
 */



const tintColorLight = '#FACC15'; // Yellow-400
const tintColorDark = '#FACC15';

export const Colors = {
  light: {
    text: '#FAFAFA', // Zinc-50
    textSecondary: '#A1A1AA', // Zinc-400
    background: '#000000', // Black
    tint: tintColorLight,
    icon: '#FAFAFA',
    tabIconDefault: '#A1A1AA',
    tabIconSelected: tintColorLight,
    card: '#18181B', // Zinc-900
    border: '#27272A', // Zinc-800
    gradientStart: '#FACC15', // Yellow-400
    gradientEnd: '#F97316', // Orange-500
    success: '#22C55E', // Green-500
    error: '#EF4444', // Red-500
    warning: '#F59E0B', // Amber-500
  },
  dark: {
    text: '#FAFAFA',
    textSecondary: '#A1A1AA',
    background: '#000000',
    tint: tintColorDark,
    icon: '#FAFAFA',
    tabIconDefault: '#A1A1AA',
    tabIconSelected: tintColorDark,
    card: '#18181B',
    border: '#27272A',
    gradientStart: '#FACC15',
    gradientEnd: '#F97316',
    success: '#22C55E',
    error: '#EF4444',
    warning: '#F59E0B',
  },
};

// We force dark mode for the brand aesthetic, but keep structure for potential future use
export const Theme = Colors.dark;