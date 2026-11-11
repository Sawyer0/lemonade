import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useBrandColors } from '../../hooks/useBrandColors';
import type { ThemeColors } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { TextInput } from '../../components/ui/TextInput';
import { GradientButton } from '../../components/ui/GradientButton';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const { signup, signInWithGoogle, loading, error } = useAuth();
    const router = useRouter();

    const handleSignup = async () => {
        try {
            await signup(email, password, username);
            router.replace('/');
        } catch {
            // Error handled by hook
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await signInWithGoogle();
        } catch (_e) {
            console.error(_e);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <ThemedText type="title">Create Account</ThemedText>
                        <ThemedText style={styles.subtitle}>Join the Lemonade Garage</ThemedText>
                    </View>

                    <View style={styles.form}>
                        {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

                        <TextInput
                            testID="signup-username-input"
                            label="Username"
                            placeholder="Username"
                            value={username}
                            onChangeText={setUsername}
                        />

                        <TextInput
                            testID="signup-email-input"
                            label="Email"
                            placeholder="Email"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <TextInput
                            testID="signup-password-input"
                            label="Password"
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />

                        <GradientButton
                            testID="signup-submit-button"
                            title="Sign Up"
                            onPress={handleSignup}
                            disabled={loading}
                            loading={loading}
                            style={styles.buttonSpacing}
                        />

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <ThemedText style={styles.dividerText}>OR</ThemedText>
                            <View style={styles.line} />
                        </View>

                        <GradientButton
                            title="Continue with Google"
                            variant="outline"
                            icon={<Ionicons name="logo-google" size={20} color={theme.text} />}
                            onPress={handleGoogleLogin}
                            disabled={loading}
                            style={styles.buttonSpacing}
                        />

                        <View style={styles.footer}>
                            <ThemedText>Already have an account? </ThemedText>
                            <Link href="/auth/login" asChild>
                                <TouchableOpacity>
                                    <ThemedText style={styles.linkText}>Login</ThemedText>
                                </TouchableOpacity>
                            </Link>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </ThemedView>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
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
        subtitle: {
            color: theme.textSecondary,
            marginTop: 8,
        },
        form: {
            width: '100%',
        },
        buttonSpacing: {
            marginTop: 8,
        },
        errorText: {
            color: theme.error,
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
            backgroundColor: theme.border,
        },
        dividerText: {
            marginHorizontal: 16,
            color: theme.textSecondary,
        },
        footer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 32,
        },
        linkText: {
            color: theme.tint,
            fontWeight: 'bold',
        },
    });
