import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';

export default function ChatScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Chat Screen (Web)</Text>
            <Text style={styles.subtext}>This feature is only available on mobile</Text>
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.background,
        },
        text: {
            color: theme.tint,
            fontSize: 24,
            fontWeight: 'bold',
        },
        subtext: {
            color: theme.textSecondary,
            fontSize: 16,
            marginTop: 10,
        },
    });
