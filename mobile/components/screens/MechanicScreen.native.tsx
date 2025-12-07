import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import {
//     LiveKitRoom,
//     useRemoteParticipants,
//     VideoTrack,
//     AudioSession,
//     useTracks,
// } from '@livekit/react-native';
// import { Participant, Track, VideoPresets } from 'livekit-client';

// MOCK for Expo Go
const LiveKitRoom = ({ children }: any) => <View style={{ flex: 1, backgroundColor: '#222' }}>{children}</View>;
const useRemoteParticipants = () => [];
const VideoTrack = () => <View style={{ flex: 1, backgroundColor: 'black' }} />;
const AudioSession = { startAudioSession: async () => {}, stopAudioSession: () => {} };
const useTracks = () => [];
const Track = { Source: { Camera: 'camera' } };
const VideoPresets = { h720: {} };
// Mock Participant interface if needed, or just let usage infer any
interface Participant { audioLevel: number; }
import { useLocalSearchParams } from 'expo-router';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
import { useLiveSession } from '../../hooks/useLiveSession';
import { SafetyOverlay } from '../workspace/SafetyOverlay';

// Determine LiveKit URL
const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL;

export default function LiveMechanicScreenNative() {
    const [token, setToken] = useState("");
    // Prefer sessionId, fallback to roomName, then random
    const { sessionId, roomName } = useLocalSearchParams<{ sessionId: string; roomName: string }>();
    const effectiveSessionId = sessionId || roomName || 'mechanic-' + Math.floor(Math.random() * 1000);

    // Session State (Firestore)
    const { session, safetyAlert, status: sessionStatus } = useLiveSession(effectiveSessionId);

    useEffect(() => {
        let mounted = true;

        const connect = async () => {
            try {
                await AudioSession.startAudioSession();
                const API_BASE = process.env.EXPO_PUBLIC_API_URL;
                // Use effectiveSessionId as the room name
                const endpoint = `${API_BASE}/api/livekit/token?room=${effectiveSessionId}&username=mobile-user`;

                console.log(`Fetching token from: ${endpoint}`);

                const response = await fetch(endpoint);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to fetch token');
                }

                if (mounted && data.token) {
                    setToken(data.token);
                }
            } catch (e: any) {
                console.error("Token Fetch Error:", e);
                Alert.alert("Connection Error", "Could not fetch LiveKit token. Ensure backend is running.");
            }
        };

        connect();

        return () => {
            mounted = false;
            AudioSession.stopAudioSession();
        };
    }, [effectiveSessionId]);

    const handleAcknowledgeSafety = () => {
        // TODO: Call API to acknowledge safety risk
        Alert.alert("Safety Acknowledged", "This would log the acknowledgement to the server.");
    };

    if (!token) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.text}>Connecting to Live Mechanic...</Text>
                <Text style={styles.subText}>Session: {effectiveSessionId}</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            <LiveKitRoom
                serverUrl={LIVEKIT_URL}
                token={token}
                connect={true}
                audio={true}
                // Use Back Camera ('environment') and 720p resolution
                video={{
                    facingMode: 'environment',
                    resolution: VideoPresets.h720
                }}
                style={{ flex: 1 }}
            >
                <ImmersiveSession />
            </LiveKitRoom>

            {/* Safety Overlay (Top Level) */}
            <SafetyOverlay 
                active={!!safetyAlert}
                reason={safetyAlert || undefined}
                onAcknowledge={handleAcknowledgeSafety}
                // TODO: Implement verification flow
                verificationPending={false} 
            />
            
            {/* Session Status Indicator (Top Left) */}
             <SafeAreaView style={styles.statusOverlay} pointerEvents="none">
                <View style={styles.statusBadge}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(sessionStatus) }]} />
                    <Text style={styles.statusLabel}>{sessionStatus.toUpperCase()}</Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'analyzing': return '#FACC15'; // Yellow
        case 'uploading': return '#3B82F6'; // Blue
        case 'completed': return '#22C55E'; // Green
        case 'error': return '#EF4444'; // Red
        default: return '#9CA3AF'; // Gray
    }
}

function ImmersiveSession() {
    // 1. Get Participants
    const remoteParticipants = useRemoteParticipants();
    const agent = remoteParticipants[0]; // The AI Agent is usually the first/only remote peer

    // Get all camera tracks to find local one
    const tracks = useTracks([Track.Source.Camera]);
    const localTrack = tracks.find(t => t.participant.isLocal);

    return (
        <View style={styles.container}>
            {/* 2. Full Screen User Camera (The "Background") */}
            {localTrack && (
                <VideoTrack
                    trackRef={localTrack}
                    style={styles.fullScreenVideo}
                    mirror={false} // Disable mirroring so text is readable
                />
            )}

            {/* 3. The "Voice Mode" UI Overlay */}
            <SafeAreaView style={styles.overlayContainer}>
                <View style={styles.centerStage}>
                    {agent ? (
                        <>
                            {/* Custom Audio Visualizer Hook */}
                            <AgentVisualizer participant={agent} />
                            <Text style={styles.statusText}>AI Mechanic is listening...</Text>
                        </>
                    ) : (
                        <Text style={styles.loadingText}>Connecting to Agent...</Text>
                    )}
                </View>
            </SafeAreaView>
        </View>
    );
}

// ------------------------------------------------------------------
// The Custom Visualizer (Since BarVisualizer is Web-Only)
// ------------------------------------------------------------------
function AgentVisualizer({ participant }: { participant: Participant }) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(0.5);

    useEffect(() => {
        let animationFrameId: number;

        const updateVisualizer = () => {
            // 1. Read the audio level directly (Float between 0.0 and 1.0)
            // LiveKit updates this property automatically in the background
            const level = participant.audioLevel;

            // 2. Drive the Reanimated values directly (No React re-renders!)
            // Map level (0-1) to a scale range (e.g., 1.0 to 1.8)
            if (level > 0.01) {
                scale.value = withSpring(1 + level * 0.8, { damping: 15, stiffness: 120 });
                opacity.value = withSpring(0.5 + level * 0.5);
            } else {
                scale.value = withSpring(1, { damping: 20 });
                opacity.value = withSpring(0.5);
            }

            // 3. Loop
            animationFrameId = requestAnimationFrame(updateVisualizer);
        };

        // Start the loop
        updateVisualizer();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [participant]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={[styles.orb, animatedStyle]}>
            <View style={styles.innerOrb} />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    text: { color: 'white', marginTop: 10 },
    subText: { color: '#888', marginTop: 5, fontSize: 12 },
    fullScreenVideo: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    centerStage: {
        alignItems: 'center',
        marginBottom: 60,
    },
    orb: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    innerOrb: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'white',
    },
    statusText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        textShadowColor: 'black',
        textShadowRadius: 5,
    },
    loadingText: {
        color: 'white',
        fontSize: 18,
    },
    statusOverlay: {
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 50,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusLabel: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
    }
});
