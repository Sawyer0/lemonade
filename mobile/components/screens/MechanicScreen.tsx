import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Room, RoomEvent, VideoPresets, Track, RemoteTrackPublication, RemoteParticipant, LocalTrackPublication } from 'livekit-client';
import { useLocalSearchParams } from 'expo-router';

// ------------------------------------------------------------------
// Web-Compatible Live Mechanic Screen
// ------------------------------------------------------------------

// Determine LiveKit URL
const LIVEKIT_URL = process.env.EXPO_PUBLIC_LIVEKIT_URL;

export default function LiveMechanicScreenWeb() {
    const [token, setToken] = useState("");
    const { roomName } = useLocalSearchParams<{ roomName: string }>();
    const [randomId] = useState(Math.floor(Math.random() * 1000));
    const effectiveRoomName = roomName || 'mechanic-' + randomId;
    const [room, setRoom] = useState<Room | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [agentConnected, setAgentConnected] = useState(false);

    // Refs for video elements (Web specific)
    const localVideoRef = useRef<any>(null);

    // 1. Fetch Token
    useEffect(() => {
        const connect = async () => {
            try {
                const API_BASE = process.env.EXPO_PUBLIC_API_URL;
                const endpoint = `${API_BASE}/api/livekit/token?room=${effectiveRoomName}&username=web-user`;

                // Only add debugging headers in development
                const headers: Record<string, string> = {};
                if (process.env.NODE_ENV === 'development') {
                    headers['ngrok-skip-browser-warning'] = 'true';
                }

                const response = await fetch(endpoint, { headers });
                const data = await response.json();
                if (data.token) setToken(data.token);
            } catch (e) {
                console.error("Token Fetch Error:", e);
            }
        };
        connect();
    }, [effectiveRoomName]);

    // 2. Connect to LiveKit Room (Using pure JS SDK for Web)
    useEffect(() => {
        if (!token || !LIVEKIT_URL) return;

        let roomInstance = new Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
                resolution: VideoPresets.h720.resolution,
                facingMode: 'environment' // Request Back Camera on Web
            }
        });

        const connectToRoom = async () => {
            try {
                await roomInstance.connect(LIVEKIT_URL!, token);
                setRoom(roomInstance);
                setIsConnected(true);

                // Publish Camera & Mic
                await roomInstance.localParticipant.enableCameraAndMicrophone();
                // Get Camera Track - web implementation
                const tracks = Array.from(roomInstance.localParticipant.videoTrackPublications.values());
                const cameraTrackPub = tracks.find(t => t.source === Track.Source.Camera);

                if (cameraTrackPub && cameraTrackPub.track && localVideoRef.current) {
                    cameraTrackPub.track.attach(localVideoRef.current);
                }

                // Check for existing agent
                if (roomInstance.remoteParticipants.size > 0) {
                    setAgentConnected(true);
                }

                // Listen for Agent Join
                roomInstance.on(RoomEvent.ParticipantConnected, () => setAgentConnected(true));
                roomInstance.on(RoomEvent.ParticipantDisconnected, () => {
                    if (roomInstance.remoteParticipants.size === 0) setAgentConnected(false);
                });

            } catch (e) {
                console.error("LiveKit Connect Error:", e);
            }
        };

        connectToRoom();

        return () => {
            roomInstance.disconnect();
        };
    }, [token]);

    if (!token || !isConnected) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={styles.text}>Connecting to Mechanic (Web Mode)...</Text>
            </View>
        );
    }

    // Cast React Native views to allow web-only children like <div> and <video>
    // This is a necessary escape hatch for hybrid files
    const WebContainer = View as any;

    return (
        <WebContainer style={styles.container}>
            {/* HTML Video Element for Local Camera (Full Screen) */}
            <div style={webStyles.videoContainer}>
                <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            </div>

            {/* Overlay UI */}
            <View style={styles.overlay}>
                <Text style={styles.statusText}>
                    Agent Status: {agentConnected ? "Listening" : "Waiting..."}
                </Text>
                <div style={webStyles.visualizer}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '30px',
                        backgroundColor: agentConnected ? 'white' : 'gray',
                        animation: agentConnected ? 'pulse 1.5s infinite' : 'none',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '20px', backgroundColor: '#333' }}></div>
                    </div>
                </div>
            </View>

            {/* Inject minimal CSS for the pulse animation */}
            <style>
                {`@keyframes pulse {
                    0% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.2); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 0.8; }
                }`}
            </style>
        </WebContainer>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        // @ts-ignore
        height: '100vh' as any, // Web specific
        overflow: 'hidden'
    } as import('react-native').ViewStyle,
    text: {
        color: 'white',
        marginTop: 10
    } as import('react-native').TextStyle,
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        zIndex: 10
    } as import('react-native').ViewStyle,
    statusText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10
    } as import('react-native').TextStyle
});

const webStyles = {
    videoContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0
    },
    visualizer: {
        marginTop: 10
    }
} as const;
