import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { JETBRAINS_MONO_FAMILY } from '@mobile/constants/brandFonts';
import type { Vehicle } from '@lemonade/core';

/**
 * Android (Material 3) vehicle card for the garage list. Same props as
 * the shared VehicleCard; on Android it renders a Paper Card with a
 * Chip for the issue count, themed from the brand tokens.
 */
interface VehicleCardProps {
    vehicle: Vehicle;
    onPress: () => void;
    testID?: string;
}

export function VehicleCard({ vehicle, onPress, testID }: VehicleCardProps) {
    const theme = useTheme();
    return (
        <Card mode="elevated" onPress={onPress} testID={testID} style={styles.card}>
            <Card.Content>
                <View style={styles.cardHeader}>
                    <Ionicons name="car" size={24} color={theme.colors.secondary} />
                    <Chip mode="flat" style={styles.badge} textStyle={styles.badgeText}>
                        {vehicle.activeIssuesCount} Issues
                    </Chip>
                </View>
                <Text variant="titleMedium" style={styles.vehicleTitle}>
                    {vehicle.specs.year} {vehicle.specs.make} {vehicle.specs.model}
                </Text>
                <Text variant="bodySmall" style={styles.vinText}>
                    {vehicle.vin}
                </Text>
            </Card.Content>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: 16,
        borderRadius: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    vehicleTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    vinText: {
        fontFamily: JETBRAINS_MONO_FAMILY.regular,
        fontSize: 12,
        marginTop: 4,
    },
    badge: {},
    badgeText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
});
