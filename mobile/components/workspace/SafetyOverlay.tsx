import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SafetyOverlayProps {
    active: boolean;
    reason?: string;
    onAcknowledge: () => void;
    verificationPending?: boolean;
    onCaptureFrame?: () => void;
}

export function SafetyOverlay({
    active,
    reason,
    onAcknowledge,
    verificationPending = false,
    onCaptureFrame
}: SafetyOverlayProps) {

    // State 1: Safety Verification Required (Yellow Zone)
    if (verificationPending) {
        return (
            <View style={[styles.container, styles.yellowBg]}>
                <View style={styles.iconContainer}>
                    <Ionicons name="shield-checkmark" size={64} color="#FACC15" />
                </View>
                <Text style={styles.title}>SAFETY VERIFICATION REQUIRED</Text>
                <Text style={[styles.text, styles.yellowText]}>
                    Before you proceed, I need to verify your safety setup.
                    Please point your camera at the jack stands.
                </Text>
                <TouchableOpacity
                    onPress={() => onCaptureFrame?.()}
                    style={styles.button}
                    disabled={!onCaptureFrame}
                >
                    <Ionicons name="camera" size={20} color="#713F12" />
                    <Text style={[styles.buttonText, { color: '#713F12' }]}>SHOW JACK STANDS</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // State 2: Critical Safety Alert (Red Zone)
    if (active) {
        return (
            <View style={[styles.container, styles.redBg]}>
                <Text style={{ fontSize: 60, marginBottom: 20 }}>🛑</Text>
                <Text style={styles.title}>SAFETY STOP TRIGGERED</Text>
                <Text style={[styles.text, styles.redText]}>
                    {reason || "Safety Violation Detected"}
                </Text>
                <TouchableOpacity
                    onPress={onAcknowledge}
                    style={styles.button}
                >
                    <Text style={[styles.buttonText, { color: '#7F1D1D' }]}>I ACKNOWLEDGE THE RISK</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    yellowBg: {
        backgroundColor: 'rgba(113, 63, 18, 0.95)', // yellow-900ish
    },
    redBg: {
        backgroundColor: 'rgba(127, 29, 29, 0.95)', // red-900ish
    },
    iconContainer: {
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        padding: 24,
        borderRadius: 999,
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: 'white',
        marginBottom: 8,
        textAlign: 'center',
    },
    text: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 24,
    },
    yellowText: { color: '#FEF08A' },
    redText: { color: '#FECACA', fontWeight: 'bold' },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 999,
        gap: 8,
    },
    buttonText: {
        fontWeight: 'bold',
        fontSize: 16,
    }
});
