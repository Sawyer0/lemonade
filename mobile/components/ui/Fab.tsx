import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { Ionicons } from '@expo/vector-icons';

/**
 * Floating action button. The Android variant renders a Paper FAB; this
 * shared implementation keeps the current custom look on iOS.
 */
interface FabProps {
    onPress: () => void;
    testID?: string;
    accessibilityLabel?: string;
    style?: StyleProp<ViewStyle>;
}

export function Fab({ onPress, testID, accessibilityLabel, style }: FabProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <TouchableOpacity
            testID={testID}
            accessibilityLabel={accessibilityLabel}
            style={[styles.fab, style]}
            onPress={onPress}
        >
            <Ionicons name="add" size={30} color={theme.onAccent} />
        </TouchableOpacity>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        fab: {
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: theme.tint,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
        },
    });
