import React from 'react';
import { View, StyleSheet, FlatList, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Theme } from '@mobile/constants/theme';
import { useGarage } from '@mobile/hooks/useGarage';
import { SessionCard } from '../domain/garage/SessionCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientButton } from '../ui/GradientButton';

export default function GarageScreen() {
    const { sessions, loading, error } = useGarage();
    const router = useRouter();

    const handlePressSession = (sessionId: string) => {
        router.push({
            pathname: '/session/[id]',
            params: { id: sessionId },
        });
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Theme.tint} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>My Garage</Text>
            </View>

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <SessionCard session={item} onPress={() => handlePressSession(item.id)} />}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No active sessions.</Text>
                        <GradientButton
                            title="Start Diagnosis"
                            onPress={() => router.push('/(tabs)/explore')}
                            style={{ marginTop: 20 }}
                        />
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.background,
    },
    center: {
        flex: 1,
        backgroundColor: Theme.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: 'white',
        letterSpacing: -1,
    },
    list: {
        padding: 16,
    },
    errorBox: {
        padding: 16,
        backgroundColor: Theme.stopSoft,
        margin: 16,
        borderRadius: 8,
    },
    errorText: {
        color: Theme.error,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 60,
    },
    emptyText: {
        color: Theme.textSecondary,
        fontSize: 16,
    },
});
