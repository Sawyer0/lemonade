import React, { useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Theme } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen() {
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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <ThemedText type="title">Create Account</ThemedText>
                        <ThemedText style={styles.subtitle}>Join the Lemonade Garage</ThemedText>
                    </View>

                    <View style={styles.form}>
                        {error && (
                            <ThemedText style={styles.errorText}>{error}</ThemedText>
                        )}

                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor={Theme.textSecondary}
                            value={username}
                            onChangeText={setUsername}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor={Theme.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor={Theme.textSecondary}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />

                        <TouchableOpacity
                            style={[styles.button, styles.signupButton]}
                            onPress={handleSignup}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="black" />
                            ) : (
                                <ThemedText style={styles.buttonText}>Sign Up</ThemedText>
                            )}
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <ThemedText style={styles.dividerText}>OR</ThemedText>
                            <View style={styles.line} />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, styles.googleButton]}
                            onPress={handleGoogleLogin}
                            disabled={loading}
                        >
                            <Ionicons name="logo-google" size={20} color="white" style={{ marginRight: 10 }} />
                            <ThemedText style={[styles.buttonText, { color: 'white' }]}>Continue with Google</ThemedText>
                        </TouchableOpacity>

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
    signupButton: {
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
