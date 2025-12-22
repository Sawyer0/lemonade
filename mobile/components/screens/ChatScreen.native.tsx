import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Theme } from '@mobile/constants/theme';
import { useLiveSession } from '@web-shared-hooks/useLiveSession';
import { useGeminiSession } from '@mobile/hooks/useGeminiSession';
import { useVehicle } from '@mobile/hooks/useVehicle';
import { ChatBubble } from '../domain/chat/ChatBubble.native';
import { InputBar } from '../domain/chat/InputBar.native';
import { CONFIG } from '@mobile/constants/config';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@mobile/infrastructure/firebase/config';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';


export default function ChatScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const sessionId = id;
    // State Definitions
    const { session, loading: sessionLoading } = useLiveSession(sessionId, db);
    const { vehicle } = useVehicle(session?.vehicleId);

    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [cameraActive, setCameraActive] = useState(false);
    const cameraRef = useRef<CameraView>(null);
    const frameInterval = useRef<NodeJS.Timeout | null>(null);

    // Tool Handler Logic
    const handleToolCall = (toolCall: { name: string; args: Record<string, unknown> }, { sendResponse }: { sendResponse: (response: unknown) => void }) => {
        console.log("Tool Call Received:", toolCall.name);

        if (toolCall.name === 'start_video_stream') {
            if (!cameraActive) {
                setCameraActive(true);
                sendResponse({
                    functionResponses: [{
                        name: 'start_video_stream',
                        response: { result: "Camera Opened" }
                    }]
                });
            } else {
                sendResponse({
                    functionResponses: [{
                        name: 'start_video_stream',
                        response: { result: "Camera already open" }
                    }]
                });
            }
        } else if (toolCall.name === 'checkRecalls') {
            const { year, make, model } = vehicle?.specs || {};
            if (year && make && model) {
                // Call API instead of local service
                const apiUrl = `${CONFIG.API.BASE_URL}/api/nhtsa/recalls?year=${year}&make=${make}&model=${model}`;
                
                fetch(apiUrl)
                    .then(res => {
                        if (!res.ok) throw new Error("API call failed");
                        return res.json();
                    })
                    .then(data => {
                         const recalls = data.recalls || [];
                         sendResponse({
                            functionResponses: [{
                                name: 'checkRecalls',
                                response: {
                                    recalls: recalls.length > 0 ? recalls : "No Recalls Found",
                                    vehicle: `${year} ${make} ${model}`
                                }
                            }]
                        });
                    })
                    .catch(err => {
                        console.error("Failed to fetch recalls", err);
                         sendResponse({
                            functionResponses: [{
                                name: 'checkRecalls',
                                response: { error: "Failed to fetch recalls" }
                            }]
                        });
                    });
            } else {
                sendResponse({
                    functionResponses: [{
                        name: 'checkRecalls',
                        response: { error: "Vehicle context missing" }
                    }]
                });
            }

        }
    }


    const { connect, sendMessage, loading: connecting, client } = useGeminiSession(sessionId, vehicle, handleToolCall);

    // Auto-Connect on mount when vehicle is ready
    useEffect(() => {
        if (vehicle) {
            connect();
        }
    }, [vehicle, connect]);

    // Camera Frame Loop
    useEffect(() => {
        // Robust Frame Loop: actively checks connection and handles errors
        let isProcessing = false;

        if (cameraActive && client && client.isConnected) {
            frameInterval.current = setInterval(async () => {
                if (cameraRef.current && !isProcessing) {
                    isProcessing = true;
                    try {
                        const photo = await cameraRef.current.takePictureAsync({
                            base64: true,
                            quality: 0.5,
                            skipProcessing: true
                        });

                        if (photo?.base64 && client.isConnected) {
                            client.sendRealtimeInput([{
                                mimeType: 'image/jpeg',
                                data: photo.base64
                            }]);
                        }
                    } catch (err) {
                        console.warn("Frame capture skipped:", err);
                    } finally {
                        isProcessing = false;
                    }
                }
            }, 1000);
        }

        return () => {
            if (frameInterval.current) {
                clearInterval(frameInterval.current);
                frameInterval.current = null;
            }
        };
    }, [cameraActive, client, client?.isConnected]);

    const flatListRef = useRef<FlatList>(null);

    // Scroll to bottom
    useEffect(() => {
        if (session?.messages?.length) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 200);
        }
    }, [session?.messages]);

    if (sessionLoading || connecting) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Theme.tint} />
                <Text style={{ color: 'gray', marginTop: 10 }}>{connecting ? "Connecting to Gemini..." : "Loading Session..."}</Text>
            </View>
        );
    }

    if (!session) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: 'white' }}>Session not found.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen options={{
                title: cameraActive ? "Live Vision" : `Diagnosis: ${session.complaint.slice(0, 15)}...`,
                headerStyle: { backgroundColor: Theme.background },
                headerTintColor: Theme.text,
                headerRight: () => (
                    <TouchableOpacity onPress={() => setCameraActive(!cameraActive)}>
                        <Ionicons name={cameraActive ? "videocam-off" : "videocam"} size={24} color={Theme.tint} />
                    </TouchableOpacity>
                )
            }} />

            <View style={{ flex: 1 }}>
                {/* Camera Layer */}
                {cameraActive && (
                    <View style={styles.cameraContainer}>
                        {!cameraPermission?.granted ? (
                            <TouchableOpacity onPress={requestCameraPermission} style={styles.permButton}>
                                <Text>Enable Camera</Text>
                            </TouchableOpacity>
                        ) : (
                            <CameraView
                                ref={cameraRef}
                                style={StyleSheet.absoluteFill}
                                facing="back"
                            />
                        )}
                        {/* Overlay Controls */}
                        <TouchableOpacity style={styles.closeCam} onPress={() => setCameraActive(false)}>
                            <Ionicons name="close-circle" size={40} color="white" />
                        </TouchableOpacity>
                    </View>
                )}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1, display: cameraActive ? 'none' : 'flex' }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                >
                    <FlatList
                        ref={flatListRef}
                        data={session.messages}
                        keyExtractor={(item, index) => index.toString()}
                        renderItem={({ item }) => (
                            <ChatBubble role={item.role} content={item.content} sessionId={session.id} />
                        )}
                        contentContainerStyle={styles.listContent}
                    />

                    <InputBar onSend={sendMessage} loading={false} />
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.background,
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: Theme.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 20,
    },
    cameraContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'black',
        zIndex: 10,
    },
    permButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white'
    },
    closeCam: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 25
    }
});
