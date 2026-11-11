import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import * as SystemUI from 'expo-system-ui';
import { paperThemeDark, paperThemeLight } from '@mobile/constants/paperTheme';
import { BrandColorSchemeProvider, useBrandColorScheme } from './brandColorScheme';

/**
 * Brand providers for the mobile app: the color-scheme setting resolved
 * against the OS preference, and Paper (Material 3) themed from the
 * brand tokens in that scheme.
 *
 * On Android the navigation bar background follows the themed surface so
 * the app draws edge-to-edge instead of floating over a black bar.
 */
function PaperThemeProvider({ children }: { children: React.ReactNode }) {
    const { scheme } = useBrandColorScheme();
    const theme = scheme === 'dark' ? paperThemeDark : paperThemeLight;

    useEffect(() => {
        if (Platform.OS === 'android') {
            SystemUI.setBackgroundColorAsync(theme.colors.surface).catch((error: unknown) => {
                console.error('Failed to set Android navigation bar color', error);
            });
        }
    }, [theme]);

    return <PaperProvider theme={theme}>{children}</PaperProvider>;
}

export function BrandProviders({ children }: { children: React.ReactNode }) {
    return (
        <BrandColorSchemeProvider>
            <PaperThemeProvider>{children}</PaperThemeProvider>
        </BrandColorSchemeProvider>
    );
}
