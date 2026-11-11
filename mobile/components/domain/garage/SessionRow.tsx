import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Theme } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

/**
 * Session history row for the vehicle detail screen. The Android variant
 * renders a Paper List item; this shared implementation keeps the current
 * custom look on iOS.
 */
interface SessionRowProps {
    title: string;
    date: string;
    onPress: () => void;
    testID?: string;
}

export function SessionRow({ title, date, onPress, testID }: SessionRowProps) {
    return (
        <TouchableOpacity testID={testID} style={styles.sessionItem} onPress={onPress}>
            <View style={styles.sessionInfo}>
                <ThemedText type="defaultSemiBold">{title}</ThemedText>
                <ThemedText style={styles.dateText}>{date}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Theme.textSecondary} />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    sessionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Theme.card,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    sessionInfo: {
        flex: 1,
    },
    dateText: {
        fontSize: 12,
        color: Theme.textSecondary,
        marginTop: 2,
    },
});
