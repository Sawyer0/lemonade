import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Theme } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, signInWithGoogle, loading, error } = useAuth();
    const router = useRouter();

    const handleLogin = async () => {
        try {
            await login(email, password);
            router.replace('/');
        } catch {
            // Error handled by hook
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await signInWithGoogle();
            // Google login logic in useAuth will handle redirect via state change if needed, 
            // but usually we can just wait for user state to change.
        } catch (_e) {
            console.error(_e);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Ionicons name="car-sport" size={60} color={Theme.tint} />
                        <ThemedText type="title" style={styles.title}>Lemonade</ThemedText>
                        <ThemedText style={styles.subtitle}>Master Tech in your pocket</ThemedText>
                    </View>

                    <View style={styles.form}>
                        {error && (
                            <ThemedText style={styles.errorText}>{error}</ThemedText>
                        )}

                        <TextInput
                            testID="login-email-input"
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor={Theme.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <TextInput
                            testID="login-password-input"
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor={Theme.textSecondary}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />

                        <TouchableOpacity
                            testID="login-submit-button"
                            style={[styles.button, styles.loginButton]}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="black" />
                            ) : (
                                <ThemedText style={styles.buttonText}>Login</ThemedText>
                            )}
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <ThemedText style={styles.dividerText}>OR</ThemedText>
                            <View style={styles.line} />
                        </View>

                        <TouchableOpacity
                            testID="login-google-button"
                            style={[styles.button, styles.googleButton]}
                            onPress={handleGoogleLogin}
                            disabled={loading}
                        >
                            <Ionicons name="logo-google" size={20} color="white" style={{ marginRight: 10 }} />
                            <ThemedText style={[styles.buttonText, { color: 'white' }]}>Continue with Google</ThemedText>
                        </TouchableOpacity>

                        <View style={styles.footer}>
                            <ThemedText>Don&apos;t have an account? </ThemedText>
                            <Link href="/auth/signup" asChild>
                                <TouchableOpacity>
                                    <ThemedText style={styles.linkText}>Sign Up</ThemedText>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        marginTop: 16,
        fontSize: 32,
        fontWeight: 'bold',
    },
    subtitle: {
        color: Theme.textSecondary,
        marginTop: 8,
    },
    form: {
        width: '100%',
    },
    input: {
        backgroundColor: Theme.card,
        color: Theme.text,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Theme.border,
        fontSize: 16,
    },
    button: {
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 8,
    },
    loginButton: {
        backgroundColor: Theme.tint,
    },
    googleButton: {
        backgroundColor: '#4285F4',
    },
    buttonText: {
        fontWeight: 'bold',
        fontSize: 16,
        color: 'black',
    },
    errorText: {
        color: Theme.error,
        marginBottom: 16,
        textAlign: 'center',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: Theme.border,
    },
    dividerText: {
        marginHorizontal: 16,
        color: Theme.textSecondary,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 32,
    },
    linkText: {
        color: Theme.tint,
        fontWeight: 'bold',
    },
});
