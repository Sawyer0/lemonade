import { Colors, type ThemeColors } from '@mobile/constants/theme';
import { useBrandColorScheme } from '@mobile/components/providers/brandColorScheme';

/** The legacy color map for the scheme the app renders in right now. */
export function useBrandColors(): ThemeColors {
    const { scheme } = useBrandColorScheme();
    return Colors[scheme];
}
