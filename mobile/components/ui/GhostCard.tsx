import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withRepeat, 
    withTiming, 
    withSequence,
    Easing 
} from 'react-native-reanimated';
import { GlassCard } from './GlassCard.native';

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
                withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value
    }));

    return (
        <GlassCard style={styles.container} intensity={20}>
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
        color: 'white',
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FFD700', // Gold pulse
    },
    skeletonContainer: {
        gap: 8,
    },
    skeletonLine: {
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 6,
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
    }
});
