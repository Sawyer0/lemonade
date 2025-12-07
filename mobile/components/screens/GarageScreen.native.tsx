import React from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Theme } from '@/constants/theme';
import { useGarage } from '@/hooks/useGarage';
import { SessionCard } from '../domain/garage/SessionCard.native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { GradientButton } from '../ui/GradientButton.native';

export default function GarageScreen() {
    const { sessions, loading, error } = useGarage();
    const router = useRouter();

    const handlePressSession = (sessionId: string) => {
        // Navigate to Chat Screen
        router.push({
            pathname: "/session/[id]", // Correct route
            params: { id: sessionId }
        });
    };

    // Temporary: Create New Session (Just navigates to a new flow or mechanic)
    const handleNewSession = () => {
        // For MVP, maybe just go to a "Start" screen or Mechanic
        // router.push("/mechanic");
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
                {/* <TouchableOpacity onPress={handleNewSession}>
                    <Plus color={Theme.tint} size={24} />
                </TouchableOpacity> */}
            </View>

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <SessionCard
                        session={item}
                        onPress={() => router.push({
                            pathname: "/session/[id]", // We need to create this route
                            params: { id: item.id }
                        })}
                    />
                )}
                contentContainerStyle={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No active sessions.</Text>
                        <GradientButton
                            title="Start Diagnosis"
                            onPress={() => router.push("/(tabs)/explore")} // Or mechanic
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
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
    }
});
