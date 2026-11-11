import React, { useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useBrandColors } from '../../hooks/useBrandColors';
import type { ThemeColors } from '../../constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { useVehicle } from '../../hooks/useVehicle';
import { useGarage } from '../../hooks/useGarage';
import { SessionRow } from '../../components/domain/garage/SessionRow';
import { JETBRAINS_MONO_FAMILY } from '../../constants/brandFonts';
import { Ionicons } from '@expo/vector-icons';

export default function VehicleDetailScreen() {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const { vehicle } = useVehicle(id);
    const { sessions } = useGarage();
    const router = useRouter();

    // Filter sessions for this vehicle
    const vehicleSessions = sessions.filter((s) => s.vehicleId === id);

    const startNewSession = () => {
        // Implement logic to start a new session for this vehicle
        // For now, redirect to a new session flow
        router.push(`/session/new?vehicleId=${id}`);
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen
                options={{
                    title: vehicle ? `${vehicle.specs.make} ${vehicle.specs.model}` : 'Vehicle',
                }}
            />

            <ScrollView>
                {vehicle && (
                    <View style={styles.header}>
                        <View style={styles.carIcon}>
                            <Ionicons name="car-sport" size={40} color={theme.tint} />
                        </View>
                        <ThemedText type="title">
                            {vehicle.specs.year} {vehicle.specs.make} {vehicle.specs.model}
                        </ThemedText>
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
                        </View>
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
                            <SessionRow
                                key={session.id}
                                title={session.complaint || 'General Checkup'}
                                date={session.updatedAt.toLocaleDateString()}
                                onPress={() => router.push(`/session/${session.id}`)}
                            />
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

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
        },
        header: {
            alignItems: 'center',
            padding: 24,
            backgroundColor: theme.card,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        carIcon: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: theme.accentSoft,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
        },
        vin: {
            fontFamily: JETBRAINS_MONO_FAMILY.regular,
            color: theme.textSecondary,
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
            color: theme.textSecondary,
        },
        divider: {
            width: 1,
            height: '100%',
            backgroundColor: theme.border,
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
            color: theme.tint,
            fontWeight: 'bold',
        },
        emptySessions: {
            padding: 40,
            alignItems: 'center',
        },
        emptyText: {
            color: theme.textSecondary,
        },
    });
