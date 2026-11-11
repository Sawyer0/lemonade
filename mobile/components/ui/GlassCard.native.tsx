import React, { useMemo } from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';

interface GlassCardProps extends ViewProps {
    variant?: 'default' | 'thin';
}

export function GlassCard({ children, style, variant = 'default', ...props }: GlassCardProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <View style={[styles.card, variant === 'thin' && styles.thin, style]} {...props}>
            {children}
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 16,
            // Shadow for iOS
            shadowColor: '#000',
            shadowOffset: {
                width: 0,
                height: 4,
            },
            shadowOpacity: 0.3,
            shadowRadius: 4.65,
            // Elevation for Android
            elevation: 8,
        },
        thin: {
            padding: 12,
            borderRadius: 12,
        },
    });
