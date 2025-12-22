// mobile/hooks/useGeminiSession.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { MobileLogger } from '../services/MobileLogger';
import { Vehicle } from '@lemonade/core';
import * as FileSystem from 'expo-file-system';

// LiveKit Imports
import {
    Room,
    RoomEvent,
    LocalParticipant,
    RemoteParticipant,
    Participant,
    DataPacket_Kind,
    ConnectionState,
} from 'livekit-client';

// Import the new camera vision stream hook
import { useCameraVisionStream } from './useCameraVisionStream';

// LiveKit Data Channel Topics
const AI_RESPONSE_TOPIC = "ai_response";
const CHAT_TOPIC = "chat_message";
const TOOL_RESPONSE_TOPIC = "tool_response";
const VISUAL_BURST_REQUEST = "capture_visual_burst";
const VISUAL_BURST_RESPONSE = "visual_burst_response";

interface ToolCall {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
    };
}

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
    onToolCall?: (toolCall: ToolCall['functionCall'], actions: { sendResponse: (res: unknown) => void }) => void
) {
    const logger = useRef(new MobileLogger()).current;

    // LiveKit State
    const [isLive, setIsLive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [room, setRoom] = useState<Room | null>(null);
    const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
    const [aiResponses, setAiResponses] = useState<AiResponseData[]>([]);
    const [agentState, setAgentState] = useState<'idle' | 'listening' | 'thinking'>('idle');

    const messageQueue = useRef<string[]>([]);
    const pendingToolResponses = useRef<{ toolCallId: string; response: unknown }[]>([]);
    const livekitRoomRef = useRef<Room | null>(null);

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
        frameProcessor,
        getSemanticPeak,
        currentDetections,
    } = useCameraVisionStream({
        sessionId,
    });

    /**
     * Tool response sender
     */
    const sendToolResponse = useCallback(async (response: unknown, toolCallId: string) => {
        const currentRoom = livekitRoomRef.current;
        const currentParticipant = currentRoom?.localParticipant;

        if (!currentRoom || !currentParticipant || currentRoom.state !== ConnectionState.Connected) {
            logger.warn("Cannot send tool response: Not connected. Queuing.");
            pendingToolResponses.current.push({ toolCallId, response });
            return;
        }
        try {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify({ toolCallId, response }));
            await currentParticipant.publishData(payload, {
                reliable: true,
                topic: TOOL_RESPONSE_TOPIC
            });
            logger.info(`Tool response for ${toolCallId} sent.`);
        } catch (e) {
            logger.error("Failed to send tool response", e as Error);
        }
    }, [logger]);

    /**
     * AI Response handler
     */
    const handleAiResponseFromDataChannel = useCallback(async (responseData: AiResponseData) => {
        if (responseData.type === 'audio' || responseData.type === 'vision' || responseData.type === 'chat') {
            if (responseData.analysis?.diagnosis) {
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
        } else if (responseData.type === 'tool_call' && responseData.toolCall) {
            logger.info(`Received tool call: ${responseData.toolCall.name}`);
            if (onToolCall) {
                const toolCallId = responseData.toolCall.id;
                onToolCall(
                    { name: responseData.toolCall.name, args: responseData.toolCall.args },
                    {
                        sendResponse: (res: unknown) => sendToolResponse(res, toolCallId)
                    }
                );
            }
        }
        // AI responded, so it's done thinking
        setAgentState('idle');
    }, [sessionId, onToolCall, sendToolResponse, logger]);

    /**
     * Handoff logic
     */
    const handoffToCloud = useCallback(async (reason: string) => {
        const currentRoom = livekitRoomRef.current;
        const currentParticipant = currentRoom?.localParticipant;

        if (!currentRoom || !currentParticipant || currentRoom.state !== ConnectionState.Connected) return;

        const peak = await getSemanticPeak();
        if (!peak) return;

        try {
            const base64 = await FileSystem.readAsStringAsync(peak.path, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const payload = new TextEncoder().encode(JSON.stringify({
                frames: [base64],
                metadata: {
                    reason,
                    localDetections: peak.detections,
                    timestamp: Date.now(),
                    sessionId
                }
            }));

            await currentParticipant.publishData(payload, {
                reliable: true,
                topic: VISUAL_BURST_RESPONSE
            });
            logger.info("Handoff packet synchronized.");
        } catch (e) {
            logger.error("Handoff failed", e as Error);
        }
    }, [getSemanticPeak, sessionId, logger]);

    const sendVisualBurst = useCallback(async () => {
        setAgentState('thinking');
        await handoffToCloud("Agent Request (Visual Burst)");
    }, [handoffToCloud]);

    /**
     * Chat message sender
     */
    const sendChatMessage = useCallback(async (text: string) => {
        const currentRoom = livekitRoomRef.current;
        const currentParticipant = currentRoom?.localParticipant;

        if (!currentRoom || !currentParticipant || currentRoom.state !== ConnectionState.Connected) {
            messageQueue.current.push(text);
            logger.warn("Not connected. Message queued.");
            return;
        }

        const userMsg = { role: 'user', content: text, timestamp: new Date() };
        await updateDoc(doc(db, 'sessions', sessionId), {
            messages: arrayUnion(userMsg)
        });

        try {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify(userMsg));
            await currentParticipant.publishData(payload, {
                reliable: true,
                topic: CHAT_TOPIC
            });
        } catch (e) {
            logger.error("Failed to send chat message", e as Error);
        }
    }, [sessionId, logger]);

    /**
     * Connector
     */
    const connect = useCallback(async () => {
        if (!auth.currentUser || !vehicle) return;
        if (room && (room.state === ConnectionState.Connecting || room.state === ConnectionState.Connected)) return;

        setLoading(true);
        try {
            if (!cameraPermissionGranted) {
                await requestCameraPermission();
            }

            const idToken = await auth.currentUser.getIdToken();
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            const livekitHost = process.env.EXPO_PUBLIC_LIVEKIT_HOST || 'ws://localhost:7880';

            const response = await fetch(`${API_URL}/livekit-agent/get-livekit-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    roomName: sessionId,
                    participantName: auth.currentUser.uid,
                    metadata: JSON.stringify({ vehicleContext: JSON.stringify(vehicle), userId: auth.currentUser.uid })
                })
            });

            if (!response.ok) throw new Error("Failed to fetch token");
            const { token: livekitToken } = await response.json();

            const newRoom = new Room();
            livekitRoomRef.current = newRoom;

            newRoom.on(RoomEvent.Connected, async () => {
                setIsLive(true);
                setRoom(newRoom);
                setLocalParticipant(newRoom.localParticipant);

                try {
                    await newRoom.localParticipant.enableCameraAndMicrophone();
                } catch (e) {
                    logger.error("Failed to enable media", e as Error);
                }

                const onDataReceived = (payload: Uint8Array, participant?: RemoteParticipant, _kind?: DataPacket_Kind, topic?: string) => {
                    if (participant?.identity === LIVEKIT_AGENT_CONFIG.AGENT_IDENTITY) {
                        if (topic === AI_RESPONSE_TOPIC) {
                            try {
                                const data = JSON.parse(new TextDecoder().decode(payload));
                                handleAiResponseFromDataChannel(data);
                            } catch (e) {
                                logger.error("Parse error", e as Error);
                            }
                        } else if (topic === VISUAL_BURST_REQUEST) {
                            sendVisualBurst();
                        }
                    }
                };
                newRoom.on(RoomEvent.DataReceived, onDataReceived);

                // --- Context Latch: Proactive Visual Burst on VAD ---
                // Trigger sending the "Semantic Peak" the moment the user starts speaking.
                // This ensures visual context arrives before the LLM generates a response.
                const onActiveSpeakersChanged = (speakers: Participant[]) => {
                    const isUserSpeaking = speakers.some(s => s.identity === auth.currentUser?.uid);

                    if (isUserSpeaking) {
                        setAgentState('listening');
                        logger.info('VAD Triggered: User Speaking');
                        // We still trigger burst, but now we also update UI state
                        sendVisualBurst();
                    } else if (agentState === 'listening') {
                        // User stopped speaking. If we are waiting for response, we might transition to thinking logic effectively handled by sendVisualBurst setting it to thinking.
                        // However, to avoid flickering if sendVisualBurst happened fast, we primarily rely on explicit states.
                        // Actually, sendVisualBurst sets 'thinking'. So if we just stop speaking, we shouldn't overwrite 'thinking' with 'idle'.
                    }
                };
                newRoom.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);

                // Flush queues
                while (messageQueue.current.length > 0) {
                    const msg = messageQueue.current.shift();
                    if (msg) sendChatMessage(msg);
                }
                while (pendingToolResponses.current.length > 0) {
                    const { toolCallId, response: res } = pendingToolResponses.current.shift()!;
                    sendToolResponse(res, toolCallId);
                }

                newRoom.on(RoomEvent.Disconnected, () => {
                    setIsLive(false);
                    setRoom(null);
                    setLocalParticipant(null);
                    newRoom.off(RoomEvent.DataReceived, onDataReceived);
                    newRoom.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
                });
            });

            await newRoom.connect(livekitHost, livekitToken, { autoSubscribe: false });
        } catch (e) {
            logger.error("Connection error", e as Error);
        } finally {
            setLoading(false);
        }
    }, [sessionId, vehicle, cameraPermissionGranted, requestCameraPermission, logger, handleAiResponseFromDataChannel, sendChatMessage, sendVisualBurst, sendToolResponse, LIVEKIT_AGENT_CONFIG.AGENT_IDENTITY, room]);

    const disconnect = useCallback(() => {
        livekitRoomRef.current?.disconnect();
        setIsLive(false);
        setRoom(null);
        setLocalParticipant(null);
        setAiResponses([]);
    }, []);

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
        cameraDevice,
        requestCameraPermission,
        frameProcessor,
        currentDetections,
        agentState,
    };
}
