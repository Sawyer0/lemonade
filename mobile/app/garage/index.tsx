import React, { useMemo } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useBrandColors } from '../../hooks/useBrandColors';
import type { ThemeColors } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { VehicleCard } from '../../components/domain/garage/VehicleCard';
import { ColorSchemeToggle } from '../../components/ui/ColorSchemeToggle';
import { Fab } from '../../components/ui/Fab';
import { useGarage } from '../../hooks/useGarage';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Vehicle } from '@lemonade/core';

export default function GarageScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { vehicles, loading, error } = useGarage();
    const { user, signOut } = useAuth();
    const router = useRouter();

    const renderVehicle = ({ item }: { item: Vehicle }) => (
        <VehicleCard
            vehicle={item}
            testID={`vehicle-card-${item.id}`}
            onPress={() => router.push(`/garage/${item.id}`)}
        />
    );

    if (loading) {
        return (
            <ThemedView style={styles.centered}>
                <ActivityIndicator size="large" color={theme.tint} />
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen
                options={{
                    title: 'My Garage',
                    headerRight: () => (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <ColorSchemeToggle />
                            <TouchableOpacity testID="logout-button" onPress={signOut} style={{ marginRight: 8 }}>
                                <Ionicons name="log-out-outline" size={24} color={theme.text} />
                            </TouchableOpacity>
                        </View>
                    ),
                }}
            />

            <View style={styles.header}>
                <ThemedText testID="welcome-message" type="subtitle">
                    Welcome, {user?.displayName || 'Mechanic'}
                </ThemedText>
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
                        <Ionicons name="car-outline" size={80} color={theme.border} />
                        <ThemedText type="subtitle">Garage is empty</ThemedText>
                        <ThemedText style={styles.emptySub}>Scan a VIN to add your first vehicle</ThemedText>
                    </View>
                }
                contentContainerStyle={styles.list}
            />

            <Fab testID="add-vehicle-fab" onPress={() => router.push('/garage/add')} />
        </ThemedView>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
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
            color: theme.textSecondary,
            marginTop: 4,
        },
        emptyState: {
            alignItems: 'center',
            marginTop: 100,
        },
        emptySub: {
            color: theme.textSecondary,
            marginTop: 8,
        },
        errorContainer: {
            padding: 16,
            backgroundColor: theme.stopSoft,
            margin: 16,
            borderRadius: 8,
        },
        errorText: {
            color: theme.error,
            textAlign: 'center',
        },
    });
