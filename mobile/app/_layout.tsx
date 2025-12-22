import { Stack } from 'expo-router';
import { UserProvider } from '../context/UserContext';
import { LocalPerceptionProvider, useLocalPerception } from '../context/LocalPerceptionContext';
import { Theme } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';
import BlockingSetupScreen from '../components/screens/BlockingSetupScreen';

function AppContent() {
    const { isReady } = useLocalPerception();

    if (!isReady) {
        return <BlockingSetupScreen />;
    }

    return (
        <Stack screenOptions={{
            headerStyle: { backgroundColor: Theme.background },
            headerTintColor: Theme.text,
            contentStyle: { backgroundColor: Theme.background },
        }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="session/[id]" options={{ title: 'Chat' }} />
            <Stack.Screen name="live-mechanic" options={{ title: 'Live Mechanic', presentation: 'fullScreenModal' }} />
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <UserProvider>
            <LocalPerceptionProvider>
                <StatusBar style="light" backgroundColor="#000000" />
                <AppContent />
            </LocalPerceptionProvider>
        </UserProvider>
    );
}
