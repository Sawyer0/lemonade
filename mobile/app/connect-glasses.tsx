import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MetaWearables from '../modules/meta-wearables';
import { MetaStreamView } from '../modules/meta-wearables';
import { useGeminiSession } from '../hooks/useGeminiSession';
import { useSessionVehicle } from '../hooks/useSessionVehicle';

export default function ConnectGlassesScreen() {
    // Initialise the SDK once, before the first render reads its registration state.
    const [registrationState, setRegistrationState] = useState<string>(() => {
        try {
            MetaWearables.initialize();
            return MetaWearables.getRegistrationState();
        } catch (error) {
            console.error('Failed to initialize MetaWearables:', error);
            return 'SDK_ERROR';
        }
    });
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamState, setStreamState] = useState<string>('STOPPED');
    const router = useRouter();
    // The glasses stream into an existing diagnostic session; the vehicle comes from that session.
    const { sessionId = '' } = useLocalSearchParams<{ sessionId?: string }>();
    const { vehicle, error: sessionError } = useSessionVehicle(sessionId || undefined);
    const hasSession = sessionId.length > 0;
    const {
        connect: connectAI,
        disconnect: disconnectAI,
        isLive,
        loading: aiLoading,
        aiResponses,
        agentState,
        sendExternalImage,
    } = useGeminiSession(sessionId, vehicle);

    useEffect(() => {
        const regSub = MetaWearables.addRegistrationChangeListener((event) => {
            setRegistrationState(event.state);
        });

        const streamSub = MetaWearables.addStreamStateChangeListener((event) => {
            setStreamState(event.state);
        });

        return () => {
            regSub.remove();
            streamSub.remove();
            disconnectAI();
        };
    }, [disconnectAI]);

    const handleRegister = () => {
        MetaWearables.startRegistration();
    };

    const handleRequestPermissions = async () => {
        try {
            await MetaWearables.requestPermission('CAMERA');
        } catch (_e) {
            Alert.alert('Error', 'Failed to request permissions');
        }
    };

    const handleToggleStream = async () => {
        if (isStreaming) {
            MetaWearables.stopStream();
            setIsStreaming(false);
        } else {
            try {
                // No device id: the SDK streams from the glasses paired in Meta View.
                await MetaWearables.startStream();
                setIsStreaming(true);
            } catch (_e) {
                Alert.alert('Error', 'Failed to start stream');
            }
        }
    };

    const handleConnectAI = async () => {
        if (isLive) {
            disconnectAI();
        } else {
            await connectAI();
        }
    };

    const handleCapture = async () => {
        try {
            const uri = await MetaWearables.capturePhoto();
            if (isLive) {
                await sendExternalImage(uri);
            } else {
                Alert.alert('Hardware Capture Success', `Photo saved to: ${uri}\n\n(AI not connected to receive it)`);
            }
        } catch (_e) {
            Alert.alert('Error', 'Failed to capture photo');
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <Text style={styles.title}>Ray-Ban Meta Integration</Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>1. Hardware Connectivity</Text>
                <Text style={styles.label}>Glasses Registration: {registrationState}</Text>
                <TouchableOpacity style={styles.button} onPress={handleRegister}>
                    <Text style={styles.buttonText}>Pair with Meta View</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <TouchableOpacity style={styles.button} onPress={handleRequestPermissions}>
                    <Text style={styles.buttonText}>Authorize Camera Access</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>2. LiveKit AI Brain</Text>
                {hasSession ? (
                    <>
                        <Text style={styles.label}>
                            AI Status: {isLive ? 'CONNECTED' : 'DISCONNECTED'} ({agentState})
                        </Text>
                        {sessionError && <Text style={styles.label}>{sessionError}</Text>}
                        <TouchableOpacity
                            style={[styles.button, isLive && styles.buttonStop, !vehicle && styles.buttonDisabled]}
                            onPress={handleConnectAI}
                            disabled={aiLoading || !vehicle}
                        >
                            {aiLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {isLive ? 'Disconnect Master Tech' : 'Connect Master Tech'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={styles.label}>
                            Open the glasses from a diagnostic session so the Master Tech knows which vehicle you are
                            working on.
                        </Text>
                        <TouchableOpacity style={styles.button} onPress={() => router.push('/garage')}>
                            <Text style={styles.buttonText}>Choose a Vehicle</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>3. Point-of-View Control</Text>
                <Text style={styles.label}>POV Stream: {streamState}</Text>
                <TouchableOpacity
                    style={[styles.button, isStreaming && styles.buttonStop]}
                    onPress={handleToggleStream}
                >
                    <Text style={styles.buttonText}>{isStreaming ? 'Stop Glasses Feed' : 'Start Glasses Feed'}</Text>
                </TouchableOpacity>
            </View>

            {isStreaming && (
                <View style={styles.previewContainer}>
                    <MetaStreamView style={styles.preview} />
                    <TouchableOpacity
                        style={[styles.captureButton, agentState === 'thinking' && styles.buttonDisabled]}
                        onPress={handleCapture}
                        disabled={agentState === 'thinking'}
                    >
                        <Text style={styles.buttonText}>
                            {agentState === 'thinking' ? 'AI ANALYZING...' : 'DEEP LOOK (CAPTURE & ANALYZE)'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {aiResponses.length > 0 && (
                <View style={styles.responseContainer}>
                    <Text style={styles.sectionTitle}>AI Diagnostic Insights</Text>
                    {aiResponses.map((res, i) => (
                        <View key={i} style={styles.responseItem}>
                            <Text style={styles.responseText}>{res.analysis?.diagnosis}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 20,
        marginTop: 10,
        color: '#1a1a1a',
    },
    section: {
        marginBottom: 20,
        padding: 15,
        backgroundColor: '#fff',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
        color: '#333',
    },
    label: {
        fontSize: 14,
        marginBottom: 10,
        color: '#666',
        fontWeight: '500',
    },
    button: {
        backgroundColor: '#007AFF',
        padding: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonStop: {
        backgroundColor: '#FF3B30',
    },
    buttonDisabled: {
        backgroundColor: '#ccc',
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 15,
    },
    divider: {
        height: 10,
    },
    previewContainer: {
        marginTop: 10,
        height: 450,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    preview: {
        flex: 1,
    },
    captureButton: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#fff',
    },
    responseContainer: {
        marginTop: 20,
        padding: 15,
        backgroundColor: '#E3F2FD',
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#007AFF',
    },
    responseItem: {
        marginBottom: 10,
        padding: 10,
        backgroundColor: '#fff',
        borderRadius: 8,
    },
    responseText: {
        fontSize: 15,
        color: '#333',
        lineHeight: 20,
    },
});
