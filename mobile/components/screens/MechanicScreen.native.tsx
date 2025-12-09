import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    LiveKitRoom,
    useTracks,
    VideoTrack,
    isTrackReference,
    useConnectionState
} from '@livekit/react-native';
import { Track, ConnectionState } from 'livekit-client';
import { useLiveSession } from '@web-shared-hooks/useLiveSession';
import { useHybridBridge } from '@mobile/hooks/useHybridBridge';
import { Theme } from '@mobile/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@mobile/infrastructure/firebase/config';

// Inner Component to Handle Room State and Tracks
const MechanicSessionView = ({ sessionId }: { sessionId: string }) => {
    const router = useRouter();
    const connectionState = useConnectionState();

    // 3. Get Video Tracks (Reactive)
    const tracks = useTracks([Track.Source.Camera]);

    // Find local camera track for preview (User's view of themselves)
    const localCameraTrack = tracks.find(tr => tr.participant.isLocal);

    // 4. Anemic Bridge Logic
    const { session } = useLiveSession(sessionId, db);
    const activeContent = useHybridBridge(session?.messages);

    if (connectionState === ConnectionState.Connecting) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Theme.tint} />
                <Text style={styles.loadingText}>Connecting to Mechanic...</Text>
            </View>
        );
    }

    if (connectionState === ConnectionState.Disconnected) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: 'white' }}>Disconnected</Text>
                <TouchableOpacity style={styles.buttonEnd} onPress={() => router.back()}>
                    <Text style={{ color: 'white' }}>Close</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Live Camera View (Full Screen) */}
            {localCameraTrack && isTrackReference(localCameraTrack) ? (
                <VideoTrack
                    style={styles.fullScreenVideo}
                    trackRef={localCameraTrack}
                    objectFit="cover"
                    mirror={false}
                />
            ) : (
                <View style={styles.cameraPlaceholder}>
                    <Text style={{ color: 'white' }}>Waiting for Camera...</Text>
                </View>
            )}

            {/* Context Aware Pill */}
            {activeContent && (
                <View style={styles.pillContainer}>
                    <TouchableOpacity
                        style={styles.pill}
                        onPress={() => router.push(`/session/${sessionId}`)}
                    >
                        <Ionicons name="document-text" size={20} color="white" style={{ marginRight: 8 }} />
                        <Text style={styles.pillText}>Shared: {activeContent.title}</Text>
                        <Ionicons name="chevron-forward" size={16} color="white" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Controls Overlay */}
            <View style={styles.controls}>
                <TouchableOpacity style={styles.buttonEnd} onPress={() => router.back()}>
                    <Ionicons name="call" size={24} color="white" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default function MechanicScreenNative() {
    const { roomName, sessionId } = useLocalSearchParams<{ roomName: string, sessionId: string }>();
    const [token, setToken] = useState("");

    // 1. Fetch Token Logic
    useEffect(() => {
        const fetchToken = async () => {
            try {
                const API_BASE = process.env.EXPO_PUBLIC_API_URL;
                const randomId = Math.floor(Math.random() * 1000);
                const effectiveRoom = roomName || 'mechanic-' + randomId;
                const endpoint = `${API_BASE}/api/livekit/token?room=${effectiveRoom}&username=native-user`;

                const response = await fetch(endpoint);
                const data = await response.json();
                if (data.token) setToken(data.token);
            } catch (e) {
                console.error("Token Error", e);
                Alert.alert("Connection Failed", "Could not fetch video token.");
            }
        };
        fetchToken();
    }, [roomName]);

    if (!token) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Theme.tint} />
            </View>
        );
    }

    return (
        <LiveKitRoom
            serverUrl={process.env.EXPO_PUBLIC_LIVEKIT_URL}
            token={token}
            connect={true}
            options={{
                adaptiveStream: true,
                dynacast: true,
            }}
            audio={true}
            video={true}
        >
            <MechanicSessionView sessionId={sessionId} />
        </LiveKitRoom>
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
        backgroundColor: Theme.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: Theme.text,
        marginTop: 10,
    },
    cameraPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1a1a1a'
    },
    pillContainer: {
        position: 'absolute',
        top: 60,
        width: '100%',
        alignItems: 'center',
        zIndex: 100,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    pillText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
    },
    controls: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
    },
    buttonEnd: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
