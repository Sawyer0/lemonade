import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { auth } from '../../infrastructure/firebase/config';
import { useBrandColors } from '../../hooks/useBrandColors';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';

export default function NewSessionRoute() {
    const theme = useBrandColors();
    const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
    const router = useRouter();

    useEffect(() => {
        const createSession = async () => {
            if (!vehicleId) return;

            try {
                const idToken = await auth.currentUser?.getIdToken();
                const API_URL = process.env.EXPO_PUBLIC_API_URL;

                const response = await fetch(`${API_URL}/api/session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ vehicleId }),
                });

                if (!response.ok) throw new Error('Failed to create session');

                const { sessionId } = await response.json();
                router.replace(`/session/${sessionId}`);
            } catch (err) {
                console.error(err);
                router.back();
            }
        };

        createSession();
    }, [vehicleId, router]);

    return (
        <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText style={{ marginTop: 16 }}>Initializing Session...</ThemedText>
        </ThemedView>
    );
}
