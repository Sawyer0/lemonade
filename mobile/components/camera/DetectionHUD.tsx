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
import { SemanticTriageResult } from '@lemonade/core';

interface DetectionHUDProps {
    detections: SemanticTriageResult[];
    agentState: 'idle' | 'listening' | 'thinking';
}

export const DetectionHUD: React.FC<DetectionHUDProps> = ({ detections, agentState }) => {
    // If no detections, render nothing
    if (detections.length === 0) return null;

    // Use the highest confidence detection for the HUD
    // Note: confidence is optional in new schema, default to 0 if missing
    const bestDetection = detections.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    const { id, eval: evaluation, confidence } = bestDetection;
    const confValue = confidence || 0;

    // Cloud Override Logic
    const isCloudActive = agentState !== 'idle';
    const isLocked = confValue >= 0.8;

    // Throbber Logic
    const borderOpacity = useSharedValue(0.5);

    useEffect(() => {
        if (isCloudActive) {
            // Pulsing for Cloud Activity
            borderOpacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        } else if (!isLocked) {
            // Pulse animation for "Searching"
            borderOpacity.value = withRepeat(
                withSequence(
                    withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0.3, { duration: 500, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            );
        } else {
            // Solid for "Locked"
            borderOpacity.value = withTiming(1, { duration: 200 });
        }
    }, [isLocked, isCloudActive]);

    const getStatusColor = () => {
        if (isCloudActive) return '#8A2BE2'; // BlueViolet
        if (!isLocked) return '#FFD700'; // Gold (Searching)

        switch (evaluation.stat) {
            case 'CRITICAL': return '#FF4444'; // Red
            case 'CAUTION': return '#FFA500'; // Orange
            case 'UNCERTAIN': return '#A9A9A9'; // Gray
            case 'NORMAL': return '#00EDA4'; // Green
            default: return '#00EDA4';
        }
    };

    const statusColor = getStatusColor();

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: borderOpacity.value,
            borderColor: statusColor,
            borderStyle: isCloudActive || isLocked ? 'solid' : 'dashed',
            borderWidth: isCloudActive ? 3 : 2,
        };
    });

    const getStatusText = () => {
        if (agentState === 'listening') return 'LISTENING...';
        if (agentState === 'thinking') return 'THINKING...';
        
        const note = evaluation.note && evaluation.stat !== 'NORMAL' ? evaluation.note : evaluation.stat;
        return note.toUpperCase();
    };

    return (
        <View style={styles.container} pointerEvents="none">
            <View style={styles.centerReticleContainer}>
                <Animated.View style={[styles.reticleBox, animatedStyle]}>
                    <View style={[styles.labelContainer, isCloudActive && { backgroundColor: '#8A2BE2' }]}>
                        <Text style={styles.labelText}>
                            {id.obj.toUpperCase()}
                        </Text>
                        <Text style={[styles.stateText, { color: isCloudActive ? 'white' : statusColor }]}>
                            {getStatusText()} {agentState === 'idle' && `(${Math.round(confValue * 100)}%)`}
                        </Text>
                    </View>
                </Animated.View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerReticleContainer: {
        width: 250,
        height: 150,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reticleBox: {
        width: '100%',
        height: '100%',
        borderRadius: 8,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    labelContainer: {
        position: 'absolute',
        top: -40,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        alignItems: 'center',
    },
    labelText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    stateText: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
    }
});
