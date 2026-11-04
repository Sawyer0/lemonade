import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalPerception } from '../../context/LocalPerceptionContext';
import { Theme } from '../../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function BlockingSetupScreen() {
    const { isDownloading, downloadProgress, error, ensureModel } = useLocalPerception();

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <LinearGradient colors={[Theme.gradientStart, Theme.gradientEnd]} style={styles.iconCircle}>
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
                        <ActivityIndicator size="large" color={Theme.tint} />
                        <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}% Synchronized</Text>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} />
                        </View>
                        <Text style={styles.eta}>
                            Please keep Lemonade in the foreground during this one-time secure setup.
                        </Text>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.button} onPress={ensureModel} activeOpacity={0.8}>
                        <LinearGradient
                            colors={[Theme.gradientStart, Theme.gradientEnd]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientButton}
                        >
                            <Text style={styles.buttonText}>Download Model</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.background,
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
        color: '#000',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: Theme.text,
        marginBottom: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: Theme.textSecondary,
        textAlign: 'center',
        marginBottom: 48,
        lineHeight: 24,
    },
    button: {
        width: '100%',
        height: 56,
        borderRadius: 16,
        overflow: 'hidden',
    },
    gradientButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold',
    },
    progressContainer: {
        width: '100%',
        alignItems: 'center',
    },
    progressText: {
        color: Theme.text,
        fontSize: 18,
        marginTop: 20,
        fontWeight: '600',
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: '#1C1C1E',
        borderRadius: 3,
        marginTop: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Theme.tint,
    },
    errorContainer: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
    },
    errorTitle: {
        color: Theme.error,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    errorText: {
        color: Theme.error,
        fontSize: 14,
    },
    eta: {
        color: Theme.textSecondary,
        fontSize: 12,
        marginTop: 16,
        textAlign: 'center',
    },
});
