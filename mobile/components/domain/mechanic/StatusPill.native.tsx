import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Theme } from '@mobile/constants/theme';

interface StatusPillProps {
    status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
}

export function StatusPill({ status }: StatusPillProps) {
    const getStatusColor = () => {
        switch (status) {
            case 'connected': return Theme.success;
            case 'connecting': return Theme.tint;
            case 'error': return Theme.error;
            default: return Theme.textSecondary;
        }
    };

    return (
        <View style={[styles.container, { borderColor: getStatusColor() }]}>
            <View style={[styles.dot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.text, { color: getStatusColor() }]}>{status.toUpperCase()}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    text: {
        fontSize: 12,
        fontWeight: 'bold',
    }
});
