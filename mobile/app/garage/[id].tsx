import React from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Theme } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useVehicle } from '../../hooks/useVehicle';
import { useGarage } from '../../hooks/useGarage';
import { Ionicons } from '@expo/vector-icons';
import { DiagnosticSession } from '@lemonade/core';

export default function VehicleDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { vehicle, loading: vLoading } = useVehicle(id);
    const { sessions, loading: sLoading } = useGarage();
    const router = useRouter();

    // Filter sessions for this vehicle
    const vehicleSessions = sessions.filter(s => s.vehicleId === id);

    const startNewSession = () => {
        // Implement logic to start a new session for this vehicle
        // For now, redirect to a new session flow
        router.push(`/session/new?vehicleId=${id}`);
    };

    const renderSession = ({ item }: { item: DiagnosticSession }) => (
        <TouchableOpacity 
            style={styles.sessionItem}
            onPress={() => router.push(`/session/${item.id}`)}
        >
            <View style={styles.sessionInfo}>
                <ThemedText type="defaultSemiBold">
                    {item.complaint || 'Diagnostic Check'}
                </ThemedText>
                <ThemedText style={styles.dateText}>
                    {item.updatedAt.toLocaleDateString()}
                </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Theme.textSecondary} />
        </TouchableOpacity>
    );

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: vehicle ? `${vehicle.specs.make} ${vehicle.specs.model}` : 'Vehicle' }} />
            
            <ScrollView>
                {vehicle && (
                    <View style={styles.header}>
                        <View style={styles.carIcon}>
                            <Ionicons name="car-sport" size={40} color={Theme.tint} />
                        </View>
                        <ThemedText type="title">{vehicle.specs.year} {vehicle.specs.make} {vehicle.specs.model}</ThemedText>
                        <ThemedText style={styles.vin}>{vehicle.vin}</ThemedText>
                        
                        <View style={styles.statsRow}>
                            <View style={styles.stat}>
                                <ThemedText type="defaultSemiBold">{vehicleSessions.length}</ThemedText>
                                <ThemedText style={styles.statLabel}>Sessions</ThemedText>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.stat}>
                                <ThemedText type="defaultSemiBold">{vehicle.activeIssuesCount}</ThemedText>
                                <ThemedText style={styles.statLabel}>Issues</ThemedText>
                            </View>
                        </ScrollView>
                    </View>
                )}

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <ThemedText type="subtitle">History</ThemedText>
                        <TouchableOpacity onPress={startNewSession}>
                            <ThemedText style={styles.actionText}>New Session</ThemedText>
                        </TouchableOpacity>
                    </View>

                    {vehicleSessions.length > 0 ? (
                        vehicleSessions.map((session) => (
                            <TouchableOpacity 
                                key={session.id}
                                style={styles.sessionItem}
                                onPress={() => router.push(`/session/${session.id}`)}
                            >
                                <View style={styles.sessionInfo}>
                                    <ThemedText type="defaultSemiBold">
                                        {session.complaint || 'General Checkup'}
                                    </ThemedText>
                                    <ThemedText style={styles.dateText}>
                                        {session.updatedAt.toLocaleDateString()}
                                    </ThemedText>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Theme.textSecondary} />
                            </TouchableOpacity>
                        ))
                    ) : (
                        <View style={styles.emptySessions}>
                            <ThemedText style={styles.emptyText}>No history for this vehicle</ThemedText>
                        </View>
                    )}
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: Theme.card,
        borderBottomWidth: 1,
        borderBottomColor: Theme.border,
    },
    carIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(250, 204, 21, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    vin: {
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: Theme.textSecondary,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: 24,
        width: '100%',
        justifyContent: 'center',
        gap: 40,
    },
    stat: {
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 12,
        color: Theme.textSecondary,
    },
    divider: {
        width: 1,
        height: '100%',
        backgroundColor: Theme.border,
    },
    section: {
        padding: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    actionText: {
        color: Theme.tint,
        fontWeight: 'bold',
    },
    sessionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Theme.card,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    sessionInfo: {
        flex: 1,
    },
    dateText: {
        fontSize: 12,
        color: Theme.textSecondary,
        marginTop: 2,
    },
    emptySessions: {
        padding: 40,
        alignItems: 'center',
    },
    emptyText: {
        color: Theme.textSecondary,
    }
});
