import { Stack } from 'expo-router';
import { UserProvider } from '../context/UserContext';
import { Theme } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
    return (
        <UserProvider>
            <StatusBar style="light" backgroundColor="#000000" />
            <Stack screenOptions={{
                headerStyle: { backgroundColor: Theme.background },
                headerTintColor: Theme.text,
                contentStyle: { backgroundColor: Theme.background },
            }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="session/[id]" options={{ title: 'Chat' }} />
                <Stack.Screen name="live-mechanic" options={{ title: 'Live Mechanic', presentation: 'fullScreenModal' }} />
            </Stack>
        </UserProvider>
    );
}
