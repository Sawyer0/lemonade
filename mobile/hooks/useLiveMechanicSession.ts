import { useState, useRef, useEffect, useCallback } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import * as FileSystem from 'expo-file-system/legacy';
import { Room, RoomEvent, RemoteParticipant, Participant, DataPacket_Kind, ConnectionState } from 'livekit-client';
import {
    Vehicle,
    SemanticTriageResult,
    LiveChannelTopic,
    AiResponseMessage,
    AiResponseMessageSchema,
    ProactivePingMessage,
    UserMessage,
    VisualBurstMessage,
    decodeLiveMessage,
    encodeLiveMessage,
} from '@lemonade/core';
import { db, auth } from '@mobile/infrastructure/firebase/config';
import { MobileLogger } from '../services/MobileLogger';
import { triggerGhostFeedback } from '../services/FeedbackService';
import { useCameraVisionStream } from './useCameraVisionStream';

export interface LiveToolCall {
    name: string;
    args: Record<string, unknown>;
}

export type LiveToolCallHandler = (
    toolCall: LiveToolCall,
    actions: { sendResponse: (response: unknown) => void },
) => void;

export type AgentState = 'idle' | 'listening' | 'thinking';

type AnalysisResponse = Extract<AiResponseMessage, { type: 'audio' | 'vision' | 'chat' }>;

/** Systems whose faults are hard to judge on device, so a detection always goes to the cloud. */
const COMPLEX_SYSTEMS = ['hybrid', 'abs', 'transmission', 'ecu', 'airbag', 'high voltage', 'brake system'];

function shouldEscalate(detection: SemanticTriageResult): boolean {
    const isComplex = COMPLEX_SYSTEMS.some((system) => detection.id.cat.toLowerCase().includes(system));
    return detection.eval.risk || isComplex || ['CRITICAL', 'UNCERTAIN'].includes(detection.eval.stat);
}

/**
 * Live voice-and-vision session with the LiveKit Master Tech agent for one
 * diagnostic session. Owns the room connection, the data-channel protocol
 * (see LiveChannelTopic in @lemonade/core) and on-device triage escalation.
 */
export function useLiveMechanicSession(sessionId: string, vehicle: Vehicle | null, onToolCall?: LiveToolCallHandler) {
    const logger = useRef(new MobileLogger()).current;

    const [isLive, setIsLive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [room, setRoom] = useState<Room | null>(null);
    const [aiResponses, setAiResponses] = useState<AnalysisResponse[]>([]);
    const [agentState, setAgentState] = useState<AgentState>('idle');
    const [ghostCard, setGhostCard] = useState<{ id: string; title: string } | null>(null);

    const escalatedIds = useRef<Set<string>>(new Set());
    const pendingToolResponses = useRef<{ toolCallId: string; response: unknown }[]>([]);
    const roomRef = useRef<Room | null>(null);

    const vision = useCameraVisionStream({ sessionId });
    const { cameraPermissionGranted, requestCameraPermission, getSemanticPeak, currentDetections } = vision;

    /** Publishes on a topic when connected. Returns false when there is no live room. */
    const publish = useCallback(async (topic: LiveChannelTopic, message: unknown): Promise<boolean> => {
        const current = roomRef.current;
        if (!current || current.state !== ConnectionState.Connected) return false;
        await current.localParticipant.publishData(encodeLiveMessage(message), { reliable: true, topic });
        return true;
    }, []);

    const appendToTranscript = useCallback(
        (role: 'user' | 'assistant', content: string) =>
            updateDoc(doc(db, 'sessions', sessionId), {
                messages: arrayUnion({ role, content, timestamp: new Date() }),
            }),
        [sessionId],
    );

    const sendToolResponse = useCallback(
        async (response: unknown, toolCallId: string) => {
            try {
                const sent = await publish(LiveChannelTopic.ToolResponse, { toolCallId, response });
                if (!sent) {
                    logger.warn('Not connected; queuing tool response', { toolCallId });
                    pendingToolResponses.current.push({ toolCallId, response });
                }
            } catch (e) {
                logger.error('Failed to send tool response', e as Error);
            }
        },
        [publish, logger],
    );

    const handleAiResponse = useCallback(
        async (message: AiResponseMessage) => {
            if (message.type === 'tool_call') {
                const { id, name, args } = message.toolCall;
                onToolCall?.({ name, args }, { sendResponse: (res) => sendToolResponse(res, id) });
            } else if (message.type !== 'barge-in') {
                const diagnosis = message.analysis?.diagnosis;
                if (diagnosis) {
                    setAiResponses((prev) => [...prev, message]);
                    await appendToTranscript('assistant', diagnosis);
                }
                setGhostCard(null);
            }
            setAgentState('idle');
        },
        [onToolCall, sendToolResponse, appendToTranscript],
    );

    const sendFrames = useCallback(
        async (frames: string[], metadata: Omit<VisualBurstMessage['metadata'], 'sessionId' | 'timestamp'>) => {
            const burst: VisualBurstMessage = {
                frames,
                metadata: { ...metadata, sessionId, timestamp: Date.now() },
            };
            return publish(LiveChannelTopic.VisualBurstResponse, burst);
        },
        [publish, sessionId],
    );

    /** Hands the sharpest recent on-device frame to the cloud agent. */
    const handoffToCloud = useCallback(
        async (reason: string) => {
            const peak = await getSemanticPeak();
            if (!peak) return;
            try {
                const frame = await FileSystem.readAsStringAsync(peak.path, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                if (await sendFrames([frame], { reason, localDetections: peak.detections })) {
                    logger.info('Handoff packet synchronized.', { reason });
                }
            } catch (e) {
                logger.error('Handoff failed', e as Error);
            }
        },
        [getSemanticPeak, sendFrames, logger],
    );

    const sendVisualBurst = useCallback(async () => {
        setAgentState('thinking');
        await handoffToCloud('Agent Request (Visual Burst)');
    }, [handoffToCloud]);

    const sendProactivePing = useCallback(
        async (detection: SemanticTriageResult) => {
            try {
                const ping: ProactivePingMessage = {
                    type: 'PROACTIVE_PING',
                    detection,
                    sessionId,
                    timestamp: Date.now(),
                };
                if (!(await publish(LiveChannelTopic.ProactivePing, ping))) return;

                setGhostCard({ id: detection.id.obj, title: `Inspecting ${detection.id.obj}...` });
                await triggerGhostFeedback();

                if (detection.eval.risk || detection.eval.stat === 'CRITICAL') {
                    await handoffToCloud(`Proactive Escalation: ${detection.eval.note}`);
                }
                logger.info('Proactive Ping sent', { part: detection.id.obj });
            } catch (e) {
                logger.error('Proactive Ping failed', e as Error);
            }
        },
        [sessionId, publish, handoffToCloud, logger],
    );

    // Escalate the most confident new detection once per part per session.
    useEffect(() => {
        if (!isLive || currentDetections.length === 0) return;

        const best = [...currentDetections].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
        const partId = best.id.obj.toLowerCase();
        if (escalatedIds.current.has(partId) || !shouldEscalate(best)) return;

        escalatedIds.current.add(partId);
        sendProactivePing(best);
    }, [currentDetections, isLive, sendProactivePing]);

    /** Sends a photo taken elsewhere (e.g. Meta glasses) to the agent for analysis. */
    const sendExternalImage = useCallback(
        async (uri: string) => {
            setAgentState('thinking');
            try {
                const frame = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                if (!(await sendFrames([frame], { reason: 'Meta Glasses Capture' }))) {
                    logger.warn('Cannot send external image: not connected.');
                    setAgentState('idle');
                }
            } catch (e) {
                logger.error('Failed to send external image', e as Error);
                setAgentState('idle');
            }
        },
        [sendFrames, logger],
    );

    /** Sends a typed message to the agent and records it in the session transcript. */
    const sendMessage = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            const message: UserMessage = { text: trimmed, sessionId, timestamp: Date.now() };
            try {
                if (!(await publish(LiveChannelTopic.UserMessage, message))) {
                    logger.warn('Cannot send message: not connected.');
                    return;
                }
                setAgentState('thinking');
                await appendToTranscript('user', trimmed);
            } catch (e) {
                logger.error('Failed to send message', e as Error);
                setAgentState('idle');
            }
        },
        [sessionId, publish, appendToTranscript, logger],
    );

    const connect = useCallback(async () => {
        const user = auth.currentUser;
        if (!user || !vehicle) return;
        const existing = roomRef.current;
        if (existing && existing.state !== ConnectionState.Disconnected) return;

        setLoading(true);
        try {
            if (!cameraPermissionGranted) await requestCameraPermission();

            const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/livekit-agent/get-livekit-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({
                    roomName: sessionId,
                    participantName: user.uid,
                    metadata: JSON.stringify({ vehicleContext: JSON.stringify(vehicle), userId: user.uid }),
                }),
            });
            if (!response.ok) throw new Error(`Token request failed with ${response.status}`);
            const { token } = (await response.json()) as { token: string };

            const newRoom = new Room();
            roomRef.current = newRoom;

            const onDataReceived = (
                payload: Uint8Array,
                participant?: RemoteParticipant,
                _kind?: DataPacket_Kind,
                topic?: string,
            ) => {
                if (!participant?.isAgent) return;
                if (topic === LiveChannelTopic.AiResponse) {
                    const message = decodeLiveMessage(AiResponseMessageSchema, payload);
                    if (message) handleAiResponse(message);
                    else logger.warn('Dropped malformed agent response');
                } else if (topic === LiveChannelTopic.VisualBurstRequest) {
                    sendVisualBurst();
                }
            };

            // Context latch: when the user starts talking, send the agent what the camera sees.
            const onActiveSpeakersChanged = (speakers: Participant[]) => {
                if (speakers.some((speaker) => speaker.identity === user.uid)) {
                    setAgentState('listening');
                    sendVisualBurst();
                }
            };

            newRoom.on(RoomEvent.Connected, async () => {
                setIsLive(true);
                setRoom(newRoom);
                try {
                    await newRoom.localParticipant.enableCameraAndMicrophone();
                } catch (e) {
                    logger.error('Failed to enable media', e as Error);
                }
                const queued = pendingToolResponses.current.splice(0);
                queued.forEach(({ toolCallId, response: res }) => sendToolResponse(res, toolCallId));
            });
            newRoom.on(RoomEvent.DataReceived, onDataReceived);
            newRoom.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
            newRoom.on(RoomEvent.Disconnected, () => {
                setIsLive(false);
                setRoom(null);
                setAgentState('idle');
                newRoom.removeAllListeners();
            });

            await newRoom.connect(process.env.EXPO_PUBLIC_LIVEKIT_HOST || 'ws://localhost:7880', token, {
                autoSubscribe: false,
            });
        } catch (e) {
            logger.error('Connection error', e as Error);
        } finally {
            setLoading(false);
        }
    }, [
        sessionId,
        vehicle,
        cameraPermissionGranted,
        requestCameraPermission,
        handleAiResponse,
        sendVisualBurst,
        sendToolResponse,
        logger,
    ]);

    const disconnect = useCallback(() => {
        roomRef.current?.disconnect();
        roomRef.current = null;
        setIsLive(false);
        setRoom(null);
        setAiResponses([]);
        setAgentState('idle');
        escalatedIds.current.clear();
    }, []);

    return {
        connect,
        disconnect,
        isLive,
        loading,
        room,
        aiResponses,
        agentState,
        ghostCard,
        sendMessage,
        sendExternalImage,
        cameraPermissionGranted,
        requestCameraPermission,
        cameraActive: vision.cameraActive,
        toggleCamera: vision.toggleCamera,
        cameraRef: vision.cameraRef,
        cameraDevice: vision.cameraDevice,
        frameProcessor: vision.frameProcessor,
        currentDetections,
    };
}
