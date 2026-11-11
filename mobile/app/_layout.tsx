import { useEffect } from 'react';
import { Stack, Redirect, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { LocalPerceptionProvider } from '../context/LocalPerceptionContext';
import { BrandProviders } from '../components/providers/BrandProviders';
import { useBrandColorScheme } from '../components/providers/brandColorScheme';
import { useBrandFonts } from '../hooks/useBrandFonts';
import { useBrandColors } from '../hooks/useBrandColors';
import { View, ActivityIndicator, LogBox } from 'react-native';
import { setupFeedbackService } from '../services/FeedbackService';

// Ignore noisy warnings that don't affect functionality but break E2E visual tests
LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

function ThemedStatusBar() {
    const { scheme } = useBrandColorScheme();
    return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

function RootLayoutNav() {
    const { user, isLoading } = useAuth();
    const segments = useSegments();
    const fontsLoaded = useBrandFonts();
    const theme = useBrandColors();

    if (isLoading || !fontsLoaded) {
        return (
            <View
                style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}
            >
                <ActivityIndicator size="large" color={theme.tint} />
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
                contentStyle: { backgroundColor: theme.background },
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
                <BrandProviders>
                    <ThemedStatusBar />
                    <RootLayoutNav />
                </BrandProviders>
            </LocalPerceptionProvider>
        </AuthProvider>
    );
}
