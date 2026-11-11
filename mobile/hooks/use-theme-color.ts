/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 *
 * The scheme follows the app's stored color-scheme setting (light, dark,
 * or the system preference), not the raw OS scheme — a stored 'light'
 * stays light even when the OS is dark.
 */

import { Colors } from '@mobile/constants/theme';
import { useBrandColorScheme } from '@mobile/components/providers/brandColorScheme';

export function useThemeColor(
    props: { light?: string; dark?: string },
    colorName: keyof typeof Colors.light & keyof typeof Colors.dark,
) {
    const { scheme } = useBrandColorScheme();
    const colorFromProps = props[scheme];

    if (colorFromProps) {
        return colorFromProps;
    } else {
        return Colors[scheme][colorName];
    }
}
