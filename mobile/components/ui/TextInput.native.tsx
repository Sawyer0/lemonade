import React, { useMemo } from 'react';
import { TextInput as RNTextInput, TextInputProps, StyleSheet, View, Text } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
}

export function TextInput({ label, error, style, ...props }: InputProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <View style={styles.container}>
            {label && <Text style={styles.label}>{label}</Text>}
            <RNTextInput
                style={[styles.input, error ? styles.inputError : {}, style]}
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.tint}
                {...props}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            marginBottom: 16,
        },
        label: {
            color: theme.textSecondary,
            fontSize: 14,
            marginBottom: 8,
            fontWeight: '600',
        },
        input: {
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
            padding: 16,
            color: theme.text,
            fontSize: 16,
        },
        inputError: {
            borderColor: theme.error,
        },
        errorText: {
            color: theme.error,
            fontSize: 12,
            marginTop: 4,
        },
    });
