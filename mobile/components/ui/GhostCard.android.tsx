import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { Card } from 'react-native-paper';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { usePulseOpacity } from '@mobile/hooks/usePulseOpacity';

/**
 * Android (Material 3) loading skeleton. Same props as the shared
 * GhostCard; on Android it renders a Paper Card themed from the brand
 * tokens, with the same pulse animation.
 */
interface GhostCardProps {
    title: string;
    subtitle?: string;
}

export const GhostCard: React.FC<GhostCardProps> = ({ title, subtitle }) => {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const animatedStyle = usePulseOpacity();

    return (
        <Card mode="elevated" style={styles.container}>
            <View>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>{title}</Text>
                    <Animated.View style={[styles.pulseDot, animatedStyle]} />
                </View>

                {/* Skeleton Lines */}
                <View style={styles.skeletonContainer}>
                    <Animated.View style={[styles.skeletonLine, { width: '80%' }, animatedStyle]} />
                    <Animated.View style={[styles.skeletonLine, { width: '60%' }, animatedStyle]} />
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
            </View>
        </Card>
    );
};

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            width: '100%',
            marginVertical: 8,
            padding: 16,
            borderRadius: 16,
        },
        headerRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        title: {
            fontSize: 16,
            fontWeight: '600',
            color: theme.text,
        },
        pulseDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.tint,
        },
        skeletonContainer: {
            gap: 8,
        },
        skeletonLine: {
            height: 12,
            backgroundColor: theme.surfaceRaised,
            borderRadius: 6,
        },
        subtitle: {
            fontSize: 12,
            color: theme.textSecondary,
            marginTop: 4,
        },
    });
