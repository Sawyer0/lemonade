import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import { Card } from 'react-native-paper';
import { Theme } from '@mobile/constants/theme';

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
    const opacity = useSharedValue(0.3);

    useEffect(() => {
        opacity.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            ),
            -1,
            true,
        );
    }, [opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    return (
        <Card mode="elevated" style={styles.container}>
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
        </Card>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginVertical: 8,
        padding: 16,
        borderRadius: 16,
    },
    content: {
        padding: 0,
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
