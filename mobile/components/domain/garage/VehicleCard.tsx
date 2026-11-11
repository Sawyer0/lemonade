import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { ThemedText } from '@mobile/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { JETBRAINS_MONO_FAMILY } from '@mobile/constants/brandFonts';
import type { Vehicle } from '@lemonade/core';

/**
 * Vehicle card for the garage list. The Android variant renders a Paper
 * Card; this shared implementation keeps the current custom look on iOS.
 */
interface VehicleCardProps {
    vehicle: Vehicle;
    onPress: () => void;
    testID?: string;
}

export function VehicleCard({ vehicle, onPress, testID }: VehicleCardProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    return (
        <TouchableOpacity testID={testID} style={styles.card} onPress={onPress}>
            <View style={styles.cardHeader}>
                <Ionicons name="car" size={24} color={theme.tint} />
                <View style={styles.badge}>
                    <ThemedText style={styles.badgeText}>{vehicle.activeIssuesCount} Issues</ThemedText>
                </View>
            </View>
            <ThemedText type="defaultSemiBold" style={styles.vehicleTitle}>
                {vehicle.specs.year} {vehicle.specs.make} {vehicle.specs.model}
            </ThemedText>
            <ThemedText style={styles.vinText}>{vehicle.vin}</ThemedText>
        </TouchableOpacity>
    );
}

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        card: {
            backgroundColor: theme.card,
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: theme.border,
        },
        cardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        vehicleTitle: {
            fontSize: 18,
            color: theme.text,
        },
        vinText: {
            fontFamily: JETBRAINS_MONO_FAMILY.regular,
            color: theme.textSecondary,
            fontSize: 12,
            marginTop: 4,
        },
        badge: {
            backgroundColor: theme.border,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
        },
        badgeText: {
            fontSize: 10,
            fontWeight: 'bold',
        },
    });
