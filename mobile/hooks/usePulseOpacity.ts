import { useEffect } from 'react';
import {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';

/**
 * Shared pulse for loading skeletons (GhostCard on both platforms):
 * opacity breathes 0.3 → 1 on a 2s loop. Returns the animated style to
 * spread onto the pulsing elements.
 */
export function usePulseOpacity(): ReturnType<typeof useAnimatedStyle> {
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

    return useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));
}
