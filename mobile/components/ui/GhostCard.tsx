import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { Theme } from '../../constants/theme';
import { usePulseOpacity } from '../../hooks/usePulseOpacity';

interface GhostCardProps {
    title: string;
    subtitle?: string;
}

export const GhostCard: React.FC<GhostCardProps> = ({ title, subtitle }) => {
    const animatedStyle = usePulseOpacity();

    return (
        <GlassCard style={styles.container} variant="thin">
            <View style={styles.content}>
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
        </GlassCard>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginVertical: 8,
    },
    content: {
        padding: 16,
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
        color: Theme.text,
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Theme.tint,
    },
    skeletonContainer: {
        gap: 8,
    },
    skeletonLine: {
        height: 12,
        backgroundColor: Theme.surfaceRaised,
        borderRadius: 6,
    },
    subtitle: {
        fontSize: 12,
        color: Theme.textSecondary,
        marginTop: 4,
    },
});
