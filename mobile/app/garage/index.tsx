import React from 'react';
import { StyleSheet, FlatList, TouchableOpacity, View, ActivityIndicator, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Theme } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useGarage } from '../../hooks/useGarage';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Vehicle } from '@lemonade/core';

export default function GarageScreen() {
    const { vehicles, loading, error } = useGarage();
    const { user, signOut } = useAuth();
    const router = useRouter();

    const renderVehicle = ({ item }: { item: Vehicle }) => (
        <TouchableOpacity
            testID={`vehicle-card-${item.id}`}
            style={styles.card}
            onPress={() => router.push(`/garage/${item.id}`)}
        >
            <View style={styles.cardHeader}>
                <Ionicons name="car" size={24} color={Theme.tint} />
                <View style={styles.badge}>
                    <ThemedText style={styles.badgeText}>{item.activeIssuesCount} Issues</ThemedText>
                </View>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.vehicleTitle}>
                {item.specs.year} {item.specs.make} {item.specs.model}
            </ThemedText>
            <ThemedText style={styles.vinText}>{item.vin}</ThemedText>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <ThemedView style={styles.centered}>
                <ActivityIndicator size="large" color={Theme.tint} />
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ 
                title: 'My Garage',
                headerRight: () => (
                    <TouchableOpacity
                        testID="logout-button"
                        onPress={signOut}
                        style={{ marginRight: 8 }}
                    >
                        <Ionicons name="log-out-outline" size={24} color={Theme.text} />
                    </TouchableOpacity>
                )
            }} />

            <View style={styles.header}>
                <ThemedText testID="welcome-message" type="subtitle">Welcome, {user?.displayName || 'Mechanic'}</ThemedText>
                <ThemedText style={styles.headerSub}>Manage your vehicles and diagnostic sessions.</ThemedText>
            </View>

            {error && (
                <View style={styles.errorContainer}>
                    <ThemedText style={styles.errorText}>{error}</ThemedText>
                </View>
            )}

            <FlatList
                data={vehicles}
                keyExtractor={(item) => item.id}
                renderItem={renderVehicle}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="car-outline" size={80} color={Theme.border} />
                        <ThemedText type="subtitle">Garage is empty</ThemedText>
                        <ThemedText style={styles.emptySub}>Scan a VIN to add your first vehicle</ThemedText>
                    </View>
                }
                contentContainerStyle={styles.list}
            />

            <TouchableOpacity
                testID="add-vehicle-fab"
                style={styles.fab}
                onPress={() => router.push('/garage/add')}
            >
                <Ionicons name="add" size={30} color="black" />
            </TouchableOpacity>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        padding: 16,
        paddingBottom: 100,
    },
    header: {
        padding: 16,
        paddingBottom: 8,
    },
    headerSub: {
        fontSize: 14,
        color: Theme.textSecondary,
        marginTop: 4,
    },
    card: {
        backgroundColor: Theme.card,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    vehicleTitle: {
        fontSize: 18,
        color: Theme.text,
    },
    vinText: {
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: Theme.textSecondary,
        fontSize: 12,
        marginTop: 4,
    },
    badge: {
        backgroundColor: Theme.border,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Theme.tint,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 100,
    },
    emptySub: {
        color: Theme.textSecondary,
        marginTop: 8,
    },
    errorContainer: {
        padding: 16,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        margin: 16,
        borderRadius: 8,
    },
    errorText: {
        color: Theme.error,
        textAlign: 'center',
    }
});
