import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { AlertTriangle, Car } from 'lucide-react-native';
import type { DiagnosticSession } from '@lemonade/core';
import { JETBRAINS_MONO_FAMILY } from '@mobile/constants/brandFonts';

/**
 * Android (Material 3) session card for the garage session list. Same
 * props as the shared SessionCard; on Android it renders a Paper Card
 * with Chips for the status and issue count, themed from the brand tokens.
 */
interface SessionCardProps {
    session: DiagnosticSession;
    onPress: () => void;
}

export function SessionCard({ session, onPress }: SessionCardProps) {
    const theme = useTheme();
    const dateLabel = session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : 'Just now';
    const issueCount = session.obdCodes?.length || 0;

    return (
        <Card mode="elevated" onPress={onPress} style={styles.container}>
            <Card.Content>
                <View style={styles.header}>
                    <View style={styles.idBadge}>
                        <Car size={14} color={theme.colors.onSurfaceVariant} />
                        <Text variant="labelSmall" style={styles.idText}>
                            VIN: {session.vehicleId.slice(0, 8)}...
                        </Text>
                    </View>
                    <Text variant="labelSmall" style={styles.date}>
                        {dateLabel}
                    </Text>
                </View>

                <Text variant="titleMedium" numberOfLines={2} style={styles.complaint}>
                    {session.complaint}
                </Text>

                <View style={styles.footer}>
                    <StatusChip status={session.status} />
                    {issueCount > 0 && (
                        <Chip
                            mode="flat"
                            icon={({ size, color }) => <AlertTriangle size={size} color={color} />}
                            textStyle={styles.issueText}
                        >
                            {issueCount} Issues
                        </Chip>
                    )}
                </View>
            </Card.Content>
        </Card>
    );
}

function StatusChip({ status }: { status: string }) {
    const theme = useTheme();
    const dotColor =
        status === 'active'
            ? theme.colors.tertiary
            : status === 'analyzing'
              ? theme.colors.secondary
              : theme.colors.onSurfaceVariant;
    return (
        <Chip mode="flat" icon={() => <View style={[styles.dot, { backgroundColor: dotColor }]} />}>
            {status.toUpperCase()}
        </Chip>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
        borderRadius: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    idBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    idText: {
        fontFamily: JETBRAINS_MONO_FAMILY.regular,
        fontSize: 12,
    },
    date: {
        fontSize: 12,
    },
    complaint: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    footer: {
        flexDirection: 'row',
        gap: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    issueText: {
        fontSize: 12,
    },
});
