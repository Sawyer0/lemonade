import React from 'react';
import { StyleSheet } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ThemedView } from '../../components/themed-view';
import { VinScanner } from '../../components/VinScanner';
import { useVehicle } from '../../hooks/useVehicle';
import { useAuth } from '../../context/AuthContext';

export default function AddVehicleScreen() {
    const { user } = useAuth();
    const { onboardVehicle, loading, error } = useVehicle();
    const router = useRouter();

    const handleVinScanned = async (vin: string) => {
        if (!user) return;
        try {
            const vehicle = await onboardVehicle(vin, user.id);
            // Redirect to the new vehicle's detail page
            router.replace(`/garage/${vehicle.id}`);
        } catch (e) {
            console.error('Failed to onboard vehicle', e);
            throw e; // lets the scanner re-arm so the user can try again
        }
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: 'Add Vehicle' }} />
            <VinScanner onScan={handleVinScanned} onClose={() => router.back()} loading={loading} error={error} />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
