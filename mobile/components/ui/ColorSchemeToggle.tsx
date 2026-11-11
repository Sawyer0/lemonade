import React from 'react';
import { IconButton } from 'react-native-paper';
import { nextBrandColorSchemeMode, type BrandColorSchemeMode } from '@mobile/constants/brandScheme';
import { useBrandColorScheme } from '@mobile/components/providers/brandColorScheme';

const MODE_ICON: Record<BrandColorSchemeMode, string> = {
    light: 'white-balance-sunny',
    dark: 'moon-waning-crescent',
    system: 'brightness-auto',
};

const MODE_LABEL: Record<BrandColorSchemeMode, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
};

/**
 * Cycles the app color scheme: Light -> Dark -> System -> Light.
 * The choice persists as the stored setting; System follows the OS
 * preference. The icon shows the current mode.
 */
export function ColorSchemeToggle() {
    const { mode, setMode } = useBrandColorScheme();
    const next = nextBrandColorSchemeMode(mode);
    return (
        <IconButton
            testID="color-scheme-toggle"
            accessibilityLabel={`Color scheme: ${MODE_LABEL[mode]}. Activate to switch to ${MODE_LABEL[next]} mode.`}
            icon={MODE_ICON[mode]}
            onPress={() => void setMode(next)}
        />
    );
}
