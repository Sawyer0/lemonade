import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Theme } from '@mobile/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useGeminiSession } from '@mobile/hooks/useGeminiSession';
import { useVehicle } from '@mobile/hooks/useVehicle';
import { Camera } from 'react-native-vision-camera';

import { useNativeAuth } from '@mobile/hooks/useNativeAuth';
import { DetectionHUD } from '../camera/DetectionHUD';
import { GhostCard } from '../ui/GhostCard';

export default function MechanicScreenNative() {
    const router = useRouter();
    const { sessionId, vehicleContext } = useLocalSearchParams<{ sessionId: string; vehicleContext: string }>();

    // Vehicle Context Resolution
    const vehicleId = typeof vehicleContext === 'string' ? vehicleContext : undefined;
    const { vehicle } = useVehicle(vehicleId);
    useNativeAuth();

    // Refs to hold mutable camera state/functions without triggering useCallback/useEffect dependencies
    const cameraActiveRef = useRef<boolean>(false);
    const toggleCameraRef = useRef<() => void>(() => {});

    // Tool Handler for Server-Driven Gating
    // Use useCallback to memoize, ensuring it only recreates if its dependencies (the refs) change
    const handleToolCall = useCallback(
        (
            toolCall: { name: string; args: Record<string, unknown> },
            { sendResponse }: { sendResponse: (response: unknown) => void },
        ) => {
            console.log('[MechanicScreen] Tool Call:', toolCall.name);

            // Access current values via refs
            const currentCameraActive = cameraActiveRef.current;
            const currentToggleCamera = toggleCameraRef.current;

            if (toolCall.name === 'start_video_stream') {
                if (!currentCameraActive) {
                    currentToggleCamera(); // Toggle camera active state
                    sendResponse({
                        functionResponses: [
                            {
                                name: 'start_video_stream',
                                response: { result: 'Camera Opened. Streaming video...' },
                            },
                        ],
                    });
                } else {
                    sendResponse({
                        functionResponses: [
                            {
                                name: 'start_video_stream',
                                response: { result: 'Camera is already open and streaming.' },
                            },
                        ],
                    });
                }
            } else if (toolCall.name === 'stop_video_stream') {
                if (currentCameraActive) {
                    currentToggleCamera(); // Toggle camera active state
                    sendResponse({
                        functionResponses: [
                            {
                                name: 'stop_video_stream',
                                response: { result: 'Camera Closed.' },
                            },
                        ],
                    });
                } else {
                    sendResponse({
                        functionResponses: [
                            {
                                name: 'stop_video_stream',
                                response: { result: 'Camera is already closed.' },
                            },
                        ],
                    });
                }
            }
        },
        [],
    ); // Empty dependency array because it accesses mutable refs

    // Connect to Gemini (now LiveKit via Agent)
    const {
        connect,
        loading,
        room,
        aiResponses,
        sendMessage,

        cameraPermissionGranted,
        cameraActive,
        toggleCamera,
        cameraRef,
        cameraDevice,
        requestCameraPermission,
        currentDetections,
        frameProcessor,
        agentState,
        ghostCard,
    } = useGeminiSession(sessionId, vehicle, handleToolCall);

    // Keep refs updated with the latest state/functions from useGeminiSession
    useEffect(() => {
        cameraActiveRef.current = cameraActive;
    }, [cameraActive]);

    useEffect(() => {
        toggleCameraRef.current = toggleCamera;
    }, [toggleCamera]);

    const [chatMessage, setChatMessage] = useState('');

    const handleSendMessage = () => {
        if (chatMessage.trim()) {
            sendMessage(chatMessage);
            setChatMessage('');
        }
    };

    const scrollViewRef = useRef<ScrollView>(null);

    // Auto-connect to session on mount
    useEffect(() => {
        connect();
    }, [connect]);

    if (!cameraPermissionGranted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>We need your permission to show the camera</Text>
                <TouchableOpacity onPress={requestCameraPermission} style={styles.permissionButton}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.buttonEndHelper} onPress={() => router.back()}>
                    <Text style={{ color: 'white' }}>Close</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // isLive is inferred from the room connection status.
    const isLive = room?.state === 'connected';

    return (
        <View style={styles.container}>
            {/* Native Camera View */}
            {cameraActive && cameraDevice ? (
                <Camera
                    style={styles.fullScreenVideo}
                    ref={cameraRef}
                    device={cameraDevice}
                    isActive={cameraActive}
                    frameProcessor={frameProcessor}
                />
            ) : (
                <View
                    style={[
                        styles.fullScreenVideo,
                        { backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
                    ]}
                >
                    <Ionicons name="eye-off-outline" size={64} color="#333" />
                    <Text style={{ color: '#666', marginTop: 10 }}>Waiting for AI to request vision...</Text>
                </View>
            )}

            {/* AI HUD Overlay */}
            {cameraActive && <DetectionHUD detections={currentDetections} agentState={agentState} />}

            <SafeAreaView style={styles.hudOverlay} pointerEvents="box-none">
                {/* Top Status Bar */}
                <View style={styles.topStatus}>
                    <View style={styles.statusBadge}>
                        <View style={[styles.statusDot, { backgroundColor: isLive ? '#00EDA4' : '#666' }]} />
                        <Text style={styles.statusText}>
                            {loading
                                ? 'CONNECTING...'
                                : isLive
                                  ? cameraActive
                                      ? 'LIVE VISION ACTIVE'
                                      : 'LIVE CONNECTED'
                                  : 'STANDBY'}
                        </Text>
                    </View>
                </View>

                {/* Ghost Card (Proactive Triage) */}
                {ghostCard && (
                    <View style={{ paddingHorizontal: 20 }}>
                        <GhostCard title={ghostCard.title} subtitle="Consulting Cloud Agent..." />
                    </View>
                )}

                {/* AI Responses Display */}
                <ScrollView
                    style={styles.aiResponsesContainer}
                    contentContainerStyle={styles.aiResponsesContentContainer}
                    ref={scrollViewRef}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                >
                    {aiResponses.map((response, index) => (
                        <View key={index} style={styles.aiResponseMessage}>
                            <Text style={styles.aiResponseMessageText}>{response.analysis?.diagnosis}</Text>
                            <Text style={styles.aiResponseTime}>
                                {response.type} - {new Date().toLocaleTimeString()}
                            </Text>
                        </View>
                    ))}
                </ScrollView>

                {/* Center Reticle (Only when active) */}
                {cameraActive && (
                    <View style={styles.reticleContainer} pointerEvents="none">
                        <View style={styles.reticleCornerTopLeft} />
                        <View style={styles.reticleCornerTopRight} />
                        <View style={styles.reticleCornerBottomLeft} />
                        <View style={styles.reticleCornerBottomRight} />
                    </View>
                )}

                {/* Chat Input */}
                <View style={styles.chatInputContainer}>
                    <TextInput
                        style={styles.chatInput}
                        placeholder="Type a message..."
                        placeholderTextColor="#999"
                        value={chatMessage}
                        onChangeText={setChatMessage}
                    />
                    <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                        <Ionicons name="send" size={24} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Bottom Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity style={styles.buttonEnd} onPress={() => router.back()}>
                        <Ionicons name="close" size={28} color="white" />
                    </TouchableOpacity>

                    {/* Manual Override Button (Optional, but good for UX) */}
                    <TouchableOpacity
                        style={[styles.buttonSnapshot, { borderColor: cameraActive ? '#00EDA4' : 'gray' }]}
                        onPress={toggleCamera}
                    >
                        <Ionicons name={cameraActive ? 'videocam' : 'videocam-off'} size={32} color="white" />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    fullScreenVideo: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    loadingContainer: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    permissionContainer: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    permissionText: {
        color: 'white',
        textAlign: 'center',
        marginBottom: 20,
        fontSize: 16,
    },
    permissionButton: {
        backgroundColor: Theme.tint,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        marginBottom: 20,
    },
    permissionButtonText: {
        color: 'white',
        fontWeight: 'bold',
    },
    buttonEndHelper: {
        padding: 10,
    },
    hudOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    topStatus: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 12,
        letterSpacing: 1,
    },
    aiResponsesContainer: {
        flex: 1, // Take up available space
        paddingHorizontal: 15,
        paddingVertical: 10,
    },
    aiResponsesContentContainer: {
        justifyContent: 'flex-end',
    },
    aiResponseMessage: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
        maxWidth: '80%',
        alignSelf: 'flex-start',
    },
    aiResponseMessageText: {
        color: 'white',
        fontSize: 14,
    },
    aiResponseTime: {
        color: '#ccc',
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    reticleContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 250,
        height: 150,
        marginLeft: -125,
        marginTop: -75,
        justifyContent: 'space-between',
    },
    reticleCornerTopLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 20,
        height: 20,
        borderColor: 'rgba(255,255,255,0.5)',
        borderTopWidth: 2,
        borderLeftWidth: 2,
    },
    reticleCornerTopRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 20,
        height: 20,
        borderColor: 'rgba(255,255,255,0.5)',
        borderTopWidth: 2,
        borderRightWidth: 2,
    },
    reticleCornerBottomLeft: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 20,
        height: 20,
        borderColor: 'rgba(255,255,255,0.5)',
        borderBottomWidth: 2,
        borderLeftWidth: 2,
    },
    reticleCornerBottomRight: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 20,
        height: 20,
        borderColor: 'rgba(255,255,255,0.5)',
        borderBottomWidth: 2,
        borderRightWidth: 2,
    },
    chatInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    chatInput: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        color: 'white',
        marginRight: 10,
    },
    sendButton: {
        backgroundColor: Theme.tint,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    buttonEnd: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(255, 68, 68, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonSnapshot: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.2)', // Glassmorphism style
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'white',
    },
});
