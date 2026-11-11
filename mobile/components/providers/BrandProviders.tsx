import React, { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import * as SystemUI from 'expo-system-ui';
import { buildPaperTheme } from '@mobile/constants/paperTheme';

/**
 * Brand providers for the mobile app: Paper (Material 3) themed from the
 * brand tokens. The color scheme is dark until #46 adds the light scheme
 * and the mode toggle.
 *
 * On Android the navigation bar background follows the themed surface so
 * the app draws edge-to-edge instead of floating over a black bar.
 */
export function BrandProviders({ children }: { children: React.ReactNode }) {
    const theme = useMemo(() => buildPaperTheme('dark'), []);

    useEffect(() => {
        if (Platform.OS === 'android') {
            SystemUI.setBackgroundColorAsync(theme.colors.surface).catch((error: unknown) => {
                console.error('Failed to set Android navigation bar color', error);
            });
        }
    }, [theme]);

    return <PaperProvider theme={theme}>{children}</PaperProvider>;
}
