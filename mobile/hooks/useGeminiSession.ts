
import { useState, useRef, useEffect, useCallback } from 'react';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { MobileLogger } from '../services/MobileLogger';
import { Vehicle } from '@lemonade/core';
import { CONFIG } from '@infrastructure/config';

// LiveKit Imports
import {
    Room,
    RoomEvent,
    LocalParticipant,
    RemoteParticipant,
    ConnectionState,
    Track,
    DataPacket_Kind,
    RemoteTrackPublication,
} from 'livekit-client';

// Import the new camera vision stream hook
import { useCameraVisionStream } from './useCameraVisionStream';

// LiveKit Data Channel Topics
const VISION_TOPIC = "vision_stream"; // Deprecated for continuous stream, but kept if needed for reference
const AI_RESPONSE_TOPIC = "ai_response";
const CHAT_TOPIC = "chat_message"; // Defined in livekit-agent, consistent here
const TOOL_RESPONSE_TOPIC = "tool_response"; // Data channel topic for client sending tool responses
const VISUAL_BURST_REQUEST = "capture_visual_burst"; // Agent -> Client
const VISUAL_BURST_RESPONSE = "visual_burst_response"; // Client -> Agent

interface ToolCall {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
    };
}

// Updated interface to match server-side MessagePart and LiveKit agent payload
interface AiResponseData {
    type: 'audio' | 'vision' | 'chat' | 'tool_call' | 'barge-in';
    analysis?: {
        diagnosis: string;
    };
    toolCall?: {
        id: string;
        name: string;
        args: Record<string, unknown>;
    };
}

export function useGeminiSession(
    sessionId: string,
    vehicle: Vehicle | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onToolCall?: (toolCall: ToolCall['functionCall'], actions: { sendResponse: (res: unknown) => void }) => void
) {
    const logger = useRef(new MobileLogger()).current;

    // LiveKit State
    const [isLive, setIsLive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [room, setRoom] = useState<Room | null>(null);
    const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
    const [aiResponses, setAiResponses] = useState<AiResponseData[]>([]);

    const messageQueue = useRef<string[]>([]);
    const pendingToolResponses = useRef<{ toolCallId: string; response: unknown }[]>([]); // Queue for offline tool responses
    const livekitRoomRef = useRef<Room | null>(null);

    // LiveKit Agent config for identity comparison (client-side copy for data channel filtering)
    const LIVEKIT_AGENT_CONFIG = {
        AGENT_IDENTITY: 'GeminiMasterTechAgent',
    };

    // Use the new camera vision stream hook
    const {
        cameraPermissionGranted,
        cameraActive,
        toggleCamera,
        cameraRef,
        cameraDevice,
        requestCameraPermission,
        flushBuffer, // Use flushBuffer instead of startCameraStreaming
        // startCameraStreaming, // Removed
        // stopCameraStreaming, // Removed (managed by buffer loop logic inside hook)
    } = useCameraVisionStream({
        localParticipant, // Pass the localParticipant from this hook
        visionTopic: VISION_TOPIC, // Kept for now
        captureInterval: 500, // 500ms for buffer capture
        sessionId,
    });

    const sendVisualBurst = useCallback(async () => {
        if (!room || !localParticipant) return;
        
        try {
            const frames = await flushBuffer();
            if (frames.length === 0) {
                logger.warn("No frames in buffer to send.");
                return;
            }

            // Send as JSON payload
            const payload = new TextEncoder().encode(JSON.stringify({ frames }));
            await localParticipant.publishData(payload, DataPacket_Kind.RELIABLE, [VISUAL_BURST_RESPONSE]);
            logger.info(`Sent visual burst with ${frames.length} frames.`);
        } catch (error) {
            logger.error("Failed to send visual burst:", error as Error);
        }
    }, [room, localParticipant, flushBuffer, logger]);

    const connect = useCallback(async () => {
        if (!auth.currentUser || !vehicle) {
            logger.warn("Connect: Missing current user or vehicle data.");
            return;
        }
        if (room && room.isConnecting) {
            logger.info("Connect: Room is already connecting.");
            return;
        }
        if (room && room.isConnected) {
            logger.info("Connect: Room is already connected.");
            return;
        }

        setLoading(true);
        try {
            // Camera permission is now handled by useCameraVisionStream, request it
            if (!cameraPermissionGranted) {
                logger.info("Camera permission not granted, requesting...");
                await requestCameraPermission();
                // If permission is denied, still try to connect to LiveKit but camera streaming won't start
            }

            const idToken = await auth.currentUser.getIdToken();
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            const livekitHost = process.env.EXPO_PUBLIC_LIVEKIT_HOST || 'ws://localhost:7880';

            // Construct Context for LiveKit Agent Metadata
            const vehicleContextJson = JSON.stringify({
                year: vehicle.specs.year,
                make: vehicle.specs.make,
                model: vehicle.specs.model,
                engine: vehicle.specs.engine,
                vin: vehicle.vin
            });
            const userId = auth.currentUser.uid;

            // 1. Fetch LiveKit Token from our Elysia.js LiveKit Agent server
            const response = await fetch(`${API_URL}/livekit-agent/get-livekit-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}` // Pass Firebase ID token for authentication
                },
                body: JSON.stringify({
                    roomName: sessionId,
                    participantName: userId,
                    metadata: JSON.stringify({ vehicleContext: vehicleContextJson, userId })
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Failed to fetch LiveKit token: ${response.statusText} - ${errorBody}`);
            }
            const { token: livekitToken } = await response.json();

            // 2. Connect to LiveKit Room
            const newRoom = new Room();
            livekitRoomRef.current = newRoom; // Store room instance

            newRoom.on(RoomEvent.Connected, async () => {
                logger.info(`Connected to LiveKit room: ${sessionId}`);
                setIsLive(true);
                setRoom(newRoom);
                setLocalParticipant(newRoom.localParticipant);

                // 3. Publish Audio (Microphone)
                try {
                    await newRoom.localParticipant.enableMicrophone();
                    logger.info("Microphone published successfully.");
                } catch (e) {
                    logger.error("Failed to publish microphone", e as Error, undefined, sessionId);
                }

                // 4. (Removed) Start Camera Streaming - Now passive until requested

                // 5. Subscribe to AI Response Data Channel (directly here, not in separate useEffect)
                const onDataReceived = (payload: Uint8Array, participant: RemoteParticipant, topic: string) => {
                    if (participant.identity === LIVEKIT_AGENT_CONFIG.AGENT_IDENTITY) {
                        if (topic === AI_RESPONSE_TOPIC) {
                            try {
                                const decoder = new TextDecoder();
                                const message = decoder.decode(payload);
                                const responseData: AiResponseData = JSON.parse(message);
                                handleAiResponseFromDataChannel(responseData);
                            } catch (e) {
                                logger.error("Failed to parse AI response from data channel", e as Error, undefined, sessionId);
                            }
                        } else if (topic === VISUAL_BURST_REQUEST) {
                            logger.info("Received request for visual burst.");
                            sendVisualBurst();
                        }
                    }
                };
                newRoom.on(RoomEvent.DataReceived, onDataReceived);
            });

            newRoom.on(RoomEvent.Disconnected, () => {
                logger.info(`Disconnected from LiveKit room: ${sessionId}`);
                setIsLive(false);
                setRoom(null);
                setLocalParticipant(null);
                // stopCameraStreaming(); // Removed
                // Clean up DataReceived listener on disconnect
                newRoom.off(RoomEvent.DataReceived);
            });

            await newRoom.connect(livekitHost, livekitToken, {
                autoSubscribe: false,
            });

            // Flush Message Queue
            while (messageQueue.current.length > 0) {
                const queuedMsg = messageQueue.current.shift();
                if (queuedMsg) {
                    sendChatMessage(queuedMsg);
                }
            }

            // Flush Tool Response Queue
            while (pendingToolResponses.current.length > 0) {
                const { toolCallId, response } = pendingToolResponses.current.shift()!;
                sendToolResponse(response, toolCallId);
            }

        } catch (e) {
            logger.error("LiveKit Connection Flow Error", e as Error, undefined, sessionId);
        } finally {
            setLoading(false);
        }
    }, [sessionId, vehicle, auth.currentUser, cameraPermissionGranted, requestCameraPermission, logger, handleAiResponseFromDataChannel, sendChatMessage, sendVisualBurst, cameraActive]);

    const disconnect = useCallback(() => {
        livekitRoomRef.current?.disconnect();
        setIsLive(false);
        setRoom(null);
        setLocalParticipant(null);
        setAiResponses([]);
        // stopCameraStreaming(); // Removed
    }, []);

    const sendChatMessage = useCallback(async (text: string) => {
        if (!room || !localParticipant) {
            messageQueue.current.push(text);
            if (!loading) {
                connect();
            }
            logger.warn("Cannot send message: LiveKit room not connected or local participant not found. Queued.");
            return;
        }

        const userMsg = { role: 'user', content: text, timestamp: new Date() };
        await updateDoc(doc(db, 'sessions', sessionId), {
            messages: arrayUnion(userMsg)
        });

        try {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify(userMsg));

            await localParticipant.publishData(payload, DataPacket_Kind.RELIABLE, [CHAT_TOPIC]); // Use CHAT_TOPIC
            logger.info("Chat message sent via LiveKit data channel.");
        } catch (e) {
            logger.error("Failed to send chat message via data channel", e as Error, undefined, sessionId);
        }
    }, [room, localParticipant, sessionId, loading, connect, logger]);

    const sendToolResponse = useCallback(async (response: unknown, toolCallId: string) => {
        if (!room || !localParticipant) {
            logger.warn("Cannot send tool response: LiveKit room not connected. Queuing.");
            pendingToolResponses.current.push({ toolCallId, response });
            if (!loading) {
                connect();
            }
            return;
        }
        try {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify({ toolCallId, response }));

            await localParticipant.publishData(payload, DataPacket_Kind.RELIABLE, [TOOL_RESPONSE_TOPIC]);
            logger.info(`Tool response for ${toolCallId} sent via LiveKit data channel.`);
        } catch (e) {
            logger.error("Failed to send tool response via data channel", e as Error, undefined, sessionId);
        }
    }, [room, localParticipant, sessionId, logger, loading, connect]);

    const handleAiResponseFromDataChannel = useCallback(async (responseData: AiResponseData) => {
        // Handle Chat/Audio/Vision text responses
        if (responseData.type === 'audio' || responseData.type === 'vision' || responseData.type === 'chat') {
            if (responseData.analysis && responseData.analysis.diagnosis) {
                const aiMsg = {
                    role: 'assistant',
                    content: responseData.analysis.diagnosis,
                    timestamp: new Date()
                };
                await updateDoc(doc(db, 'sessions', sessionId), {
                    messages: arrayUnion(aiMsg)
                });
                setAiResponses(prev => [...prev, responseData]);
            }
        }
        // Handle Tool Calls
        else if (responseData.type === 'tool_call' && responseData.toolCall) {
            logger.info(`Received tool call: ${responseData.toolCall.name}`);
            if (onToolCall) {
                onToolCall(
                    { name: responseData.toolCall.name, args: responseData.toolCall.args },
                    { 
                        sendResponse: (res: unknown) => sendToolResponse(res, responseData.toolCall!.id) 
                    }
                );
            }
        }
        // Handle Barge-in
        else if (responseData.type === 'barge-in') {
            logger.info("Received barge-in signal from agent.");
            // TODO: Stop any local TTS playback if implemented in future
            // For now, we can update UI state or clear current AI response display if it was streaming text
        }
    }, [sessionId, onToolCall, sendToolResponse, logger]);


    // Expose local participant for camera controls, etc.
    const { localParticipant: useHookLocalParticipant } = useLocalParticipant();
    useEffect(() => {
        if (useHookLocalParticipant) {
            setLocalParticipant(useHookLocalParticipant);
        }
    }, [useHookLocalParticipant]);


    return {
        connect,
        disconnect,
        sendMessage: sendChatMessage,
        isLive,
        loading,
        room,
        localParticipant,
        aiResponses,
        cameraPermissionGranted,
        cameraActive,
        toggleCamera,
        cameraRef,
        cameraDevice, // Expose cameraDevice for Camera component
        requestCameraPermission // Expose request permission for UI
    };
}

