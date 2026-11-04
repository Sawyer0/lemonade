import React from 'react';
import { TextInput as RNTextInput, TextInputProps, StyleSheet, View, Text } from 'react-native';
import { Theme } from '@mobile/constants/theme';

interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
}

export function TextInput({ label, error, style, ...props }: InputProps) {
    return (
        <View style={styles.container}>
            {label && <Text style={styles.label}>{label}</Text>}
            <RNTextInput
                style={[styles.input, error ? styles.inputError : {}, style]}
                placeholderTextColor={Theme.textSecondary}
                selectionColor={Theme.tint}
                {...props}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
    },
    label: {
        color: Theme.textSecondary,
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        backgroundColor: Theme.card,
        borderWidth: 1,
        borderColor: Theme.border,
        borderRadius: 12,
        padding: 16,
        color: Theme.text,
        fontSize: 16,
    },
    inputError: {
        borderColor: Theme.error,
    },
    errorText: {
        color: Theme.error,
        fontSize: 12,
        marginTop: 4,
    },
});
