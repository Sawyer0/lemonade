import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GlassCard } from '../../ui/GlassCard.native';
import { DiagnosticSession } from '@lemonade/core';
import { Theme } from '@mobile/constants/theme';
import { Car, AlertTriangle } from 'lucide-react-native';

interface SessionCardProps {
    session: DiagnosticSession;
    onPress: () => void;
}

export function SessionCard({ session, onPress }: SessionCardProps) {
    const dateLabel = session.updatedAt
        ? new Date(session.updatedAt).toLocaleDateString()
        : 'Just now';

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
            <GlassCard style={styles.container}>
                <View style={styles.header}>
                    <View style={styles.idBadge}>
                        <Car size={14} color={Theme.textSecondary} />
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
                            <AlertTriangle size={12} color={Theme.warning} />
                            <Text style={styles.issueText}>{session.obdCodes?.length || 0} Issues</Text>
                        </View>
                    )}
                </View>
            </GlassCard>
        </TouchableOpacity>
    );
}

function StatusBadge({ status }: { status: string }) {
    let color = Theme.textSecondary;
    let bg = 'rgba(255,255,255,0.1)';

    if (status === 'active') { color = Theme.success; bg = 'rgba(34, 197, 94, 0.1)'; }
    if (status === 'analyzing') { color = Theme.tint; bg = 'rgba(250, 204, 21, 0.1)'; }

    return (
        <View style={[styles.statusBadge, { backgroundColor: bg }]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.statusText, { color: color }]}>{status.toUpperCase()}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
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
        color: Theme.textSecondary,
        fontSize: 12,
        // fontFamily: Theme.fonts.mono,
    },
    date: {
        color: Theme.textSecondary,
        fontSize: 12,
    },
    complaint: {
        color: Theme.text,
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    footer: {
        flexDirection: 'row',
        gap: 8,
    },
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
    issueBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    issueText: {
        color: Theme.warning,
        fontSize: 12,
    }
});
