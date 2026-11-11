import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
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
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <TouchableOpacity testID={testID} style={styles.sessionItem} onPress={onPress}>
            <View style={styles.sessionInfo}>
                <ThemedText type="defaultSemiBold">{title}</ThemedText>
                <ThemedText style={styles.dateText}>{date}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        sessionItem: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            backgroundColor: theme.card,
            borderRadius: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: theme.border,
        },
        sessionInfo: {
            flex: 1,
        },
        dateText: {
            fontSize: 12,
            color: theme.textSecondary,
            marginTop: 2,
        },
    });
