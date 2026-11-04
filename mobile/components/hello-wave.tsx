import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
// Removed useEffect, useCallback, runOnJS

export function HelloWave() {
    // Initialize rotation directly with the animation sequence
    const rotation = useSharedValue(
        withRepeat(
            withSequence(
                withTiming(25, { duration: 150 }),
                withTiming(-25, { duration: 150 }),
                withTiming(25, { duration: 150 }),
                withTiming(0, { duration: 150 }),
            ),
            4, // iterations
        ),
    );

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    return <Animated.Text style={[styles.text, animatedStyle]}>👋</Animated.Text>;
}

const styles = StyleSheet.create({
    text: {
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
    },
});
