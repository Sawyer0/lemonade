import { useEffect } from 'react';
import { Stack, Redirect, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LocalPerceptionProvider } from '../context/LocalPerceptionContext';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { Theme } from '../constants/theme';
import { setupFeedbackService } from '../services/FeedbackService';

// Ignore noisy warnings that don't affect functionality but break E2E visual tests
LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

function RootLayoutNav() {
    const { user, isLoading } = useAuth();
    const segments = useSegments();

    if (isLoading) {
        return (
            <View
                style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Theme.background }}
            >
                <ActivityIndicator size="large" color={Theme.tint} />
            </View>
        );
    }

    const inAuthGroup = segments[0] === 'auth';

    if (!user && !inAuthGroup) {
        // Redirect to login if not authenticated and not already in auth flow
        return <Redirect href="/auth/login" />;
    }

    if (user && inAuthGroup) {
        // Redirect to home if authenticated and trying to access auth flow
        return <Redirect href="/" />;
    }

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#1a1a1a' },
                animation: 'slide_from_right',
                // freezeOnBlur helps with screen state preservation
                freezeOnBlur: true,
            }}
        />
    );
}

export default function RootLayout() {
    useEffect(() => {
        setupFeedbackService();
    }, []);

    return (
        <AuthProvider>
            <LocalPerceptionProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
            </LocalPerceptionProvider>
        </AuthProvider>
    );
}
