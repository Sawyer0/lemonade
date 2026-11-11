import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../ui/GlassCard';
import { DiagnosticSession } from '@lemonade/core';
import { useBrandColors } from '@mobile/hooks/useBrandColors';
import type { ThemeColors } from '@mobile/constants/theme';
import { Car, AlertTriangle } from 'lucide-react-native';

interface SessionCardProps {
    session: DiagnosticSession;
    onPress: () => void;
}

export function SessionCard({ session, onPress }: SessionCardProps) {
    const theme = useBrandColors();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const dateLabel = session.updatedAt ? new Date(session.updatedAt).toLocaleDateString() : 'Just now';

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
            <GlassCard style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.idBadge}>
                        <Car size={14} color={theme.textSecondary} />
                        <Text style={styles.idText}>VIN: {session.vehicleId.slice(0, 8)}...</Text>
                    </View>
                    <Text style={styles.date}>{dateLabel}</Text>
                </View>

                <Text style={styles.complaint} numberOfLines={2}>
                    {session.complaint}
                </Text>

                <View style={styles.footer}>
                    <StatusBadge status={session.status} />
                    {(session.obdCodes?.length || 0) > 0 && (
                        <View style={styles.issueBadge}>
                            <AlertTriangle size={12} color={theme.warning} />
                            <Text style={styles.issueText}>{session.obdCodes?.length || 0} Issues</Text>
                        </View>
                    )}
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
}

function StatusBadge({ status }: { status: string }) {
    const theme = useBrandColors();
    let color = theme.textSecondary;
    let bg = theme.surfaceRaised;

    if (status === 'active') {
        color = theme.success;
        bg = theme.goSoft;
    }
    if (status === 'analyzing') {
        color = theme.accentStrong;
        bg = theme.accentSoft;
    }

    return (
        <View style={[statusStyles.statusBadge, { backgroundColor: bg }]}>
            <View style={[statusStyles.dot, { backgroundColor: color }]} />
            <Text style={[statusStyles.statusText, { color: color }]}>{status.toUpperCase()}</Text>
        </View>
    );
}

// Layout-only styles for the badge; its colors come from the theme inline.
const statusStyles = StyleSheet.create({
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 100,
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
});

const createStyles = (theme: ThemeColors) =>
    StyleSheet.create({
        container: {
            marginBottom: 16,
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
            color: theme.textSecondary,
            fontSize: 12,
        },
        date: {
            color: theme.textSecondary,
            fontSize: 12,
        },
        complaint: {
            color: theme.text,
            fontSize: 16,
            fontWeight: 'bold',
            marginBottom: 12,
        },
        footer: {
            flexDirection: 'row',
            gap: 8,
        },
        issueBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
        },
        issueText: {
            color: theme.warning,
            fontSize: 12,
        },
    });
