import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalPerception } from '../../context/LocalPerceptionContext';
import { useBrandColors } from '../../hooks/useBrandColors';
import type { ThemeColors } from '../../constants/theme';
import { GradientButton } from '../ui/GradientButton';
import { LinearGradient } from 'expo-linear-gradient';

export default function BlockingSetupScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { isDownloading, downloadProgress, error, ensureModel } = useLocalPerception();

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} style={styles.iconCircle}>
                    <Text style={styles.icon}>AI</Text>
                </LinearGradient>

                <Text style={styles.title}>Initialize Master Tech</Text>
                <Text style={styles.subtitle}>
                    To provide private, sub-200ms vehicle diagnostic assistance, Lemonade needs to securely download its
                    core perception model (~300MB).
                </Text>

                {error && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorTitle}>Setup Failed</Text>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {isDownloading ? (
                    <View style={styles.progressContainer}>
                        <ActivityIndicator size="large" color={theme.tint} />
                        <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}% Synchronized</Text>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
                        </View>
                        <Text style={styles.eta}>
                            Please keep Lemonade in the foreground during this one-time secure setup.
                        </Text>
                    </View>
                ) : (
                    <GradientButton title="Download Model" onPress={ensureModel} style={styles.button} />
                )}
            </View>
        </View>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
            justifyContent: 'center',
            padding: 32,
        },
        content: {
            alignItems: 'center',
        },
        iconCircle: {
            width: 80,
            height: 80,
            borderRadius: 40,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 32,
        },
        icon: {
            fontSize: 32,
            fontWeight: '900',
            color: theme.onPrimary,
        },
        title: {
            fontSize: 28,
            fontWeight: 'bold',
            color: theme.text,
            marginBottom: 16,
            textAlign: 'center',
        },
        subtitle: {
            fontSize: 16,
            color: theme.textSecondary,
            textAlign: 'center',
            marginBottom: 48,
            lineHeight: 24,
        },
        button: {
            width: '100%',
            height: 56,
        },
        progressContainer: {
            width: '100%',
            alignItems: 'center',
        },
        progressText: {
            color: theme.text,
            fontSize: 18,
            marginTop: 20,
            fontWeight: '600',
        },
        progressBarBg: {
            width: '100%',
            height: 6,
            backgroundColor: theme.surfaceRaised,
            borderRadius: 3,
            marginTop: 20,
            overflow: 'hidden',
        },
        progressBarFill: {
            height: '100%',
            backgroundColor: theme.tint,
        },
        errorContainer: {
            backgroundColor: theme.stopSoft,
            padding: 16,
            borderRadius: 12,
            marginBottom: 24,
            width: '100%',
        },
        errorTitle: {
            color: theme.error,
            fontWeight: 'bold',
            marginBottom: 4,
        },
        errorText: {
            color: theme.error,
            fontSize: 14,
        },
        eta: {
            color: theme.textSecondary,
            fontSize: 12,
            marginTop: 16,
            textAlign: 'center',
        },
    });
