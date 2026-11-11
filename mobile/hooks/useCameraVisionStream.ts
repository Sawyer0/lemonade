// mobile/hooks/useCameraVisionStream.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, useCameraDevices, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalPerception } from '../context/LocalPerceptionContext';
import { useSharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';
import { MobileLogger } from '../services/MobileLogger';
import { base64ToBytes } from '../services/frameStream';
import { frameDifference, frameSharpness, toGrayscale } from '../services/frameGate';
import { SemanticTriageResult } from '@lemonade/core';

interface UseCameraVisionStreamOptions {
    sessionId: string;
}

/** Native resize target for triage frames: 384x384 RGB, the SmolVLM input size. */
export const TRIAGE_FRAME_WIDTH = 384;
export const TRIAGE_FRAME_HEIGHT = 384;

/** The best recent frame for handoff, with the signals the frame gate judges. */
export interface SemanticPeak {
    path: string;
    detections: SemanticTriageResult[];
    /** Laplacian variance of the frame; sharp frames score in the hundreds or more. */
    sharpness: number;
    /** Mean difference from the previous triage frame (0-255); low means the camera is steady. */
    motion: number;
    /** Raw RGB888 bytes of the frame, for gating and streaming. */
    rgb: Uint8Array;
}

export function useCameraVisionStream({ sessionId }: UseCameraVisionStreamOptions) {
    const logger = useRef(new MobileLogger()).current;

    // Services
    const { localPerception } = useLocalPerception();
    const { resize } = useResizePlugin();

    // Camera Permissions & Device
    const devices = useCameraDevices();
    const cameraDevice = devices.find((d) => d.position === 'back');
    const { hasPermission: cameraPermissionGranted, requestPermission: requestCameraPermission } =
        useCameraPermission();

    // State
    const [cameraActive, setCameraActive] = useState(false);
    const cameraRef = useRef<Camera>(null);
    const [currentDetections, setCurrentDetections] = useState<SemanticTriageResult[]>([]);

    // Triage State (Worklet Safe)
    const lastTriageTime = useSharedValue(0);
    const TRIAGE_INTERVAL = 1000; // Triage once per second to conserve battery/NPU
    const triageBufferPath = `${FileSystem.cacheDirectory}triage_buffer_${sessionId}.jpg`;

    // Semantic Peak Buffer: Stores the best frames from the last 5 seconds
    const triageHistory = useRef<SemanticPeak[]>([]);
    const MAX_HISTORY = 5;
    const previousGrayscale = useRef<Uint8Array | null>(null);

    /**
     * JS-side process to handle the resized buffer, save it, and run local TRIAGE.
     */
    const processFrameForTriage = useCallback(
        async (base64Data: string) => {
            if (!localPerception || !localPerception.isReady()) return;

            try {
                // Save locally for llama.rn to ingest via file path
                await FileSystem.writeAsStringAsync(triageBufferPath, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Frame-gate signals, from the same resized buffer.
                const rgb = base64ToBytes(base64Data);
                const grayscale = toGrayscale(rgb);
                const sharpness = frameSharpness(grayscale, TRIAGE_FRAME_WIDTH, TRIAGE_FRAME_HEIGHT);
                const motion = previousGrayscale.current ? frameDifference(grayscale, previousGrayscale.current) : 0;
                previousGrayscale.current = grayscale;

                // Perform Local Inference
                const detections = await localPerception.triageFrame(triageBufferPath);

                if (detections.length > 0) {
                    logger.debug('Local Triage Success', { detections });

                    // Update Realtime State for HUD
                    setCurrentDetections(detections);

                    // Update History for Semantic Peak
                    triageHistory.current.push({ path: triageBufferPath, detections, sharpness, motion, rgb });
                    if (triageHistory.current.length > MAX_HISTORY) {
                        triageHistory.current.shift();
                    }
                } else {
                    setCurrentDetections([]);
                }
            } catch (e) {
                logger.error('Failed to process frame for triage', e);
            }
        },
        [localPerception, triageBufferPath, logger],
    );

    /**
     * Native Frame Processor (Zero-Jank Pipeline)
     */
    const frameProcessor = useFrameProcessor(
        (frame) => {
            'worklet';

            const now = Date.now();
            if (now - lastTriageTime.value < TRIAGE_INTERVAL) return;
            lastTriageTime.value = now;

            // 1. Resize natively to SmolVLM resolution (384x384)
            const resized = resize(frame, {
                scale: { width: 384, height: 384 },
                pixelFormat: 'rgb',
                dataType: 'uint8',
            });

            runOnJS(processFrameForTriage)(resized.toString());
        },
        [resize, processFrameForTriage],
    );

    // ROI & Zoom State
    const [zoom, setZoom] = useState(1.0);
    const MIN_ZOOM = 1.0;
    const MAX_ZOOM = 5.0;

    /**
     * Sets the Region of Interest (ROI) by converting a normalized crop rect to a sensor zoom level.
     * @param rect Normalized ROI { x, y, width, height } where values are 0..1
     */
    const setRegionOfInterest = useCallback(
        (rect: { x: number; y: number; width: number; height: number } | null) => {
            if (!rect) {
                setZoom(MIN_ZOOM);
                return;
            }

            const targetZoom = Math.min(Math.max(1 / Math.max(rect.width, rect.height), MIN_ZOOM), MAX_ZOOM);

            logger.debug('ROI Set: Adjusting Sensor Zoom', { targetZoom, rect });
            setZoom(targetZoom);
        },
        [logger],
    );

    /**
     * Logic to find the "Semantic Peak" (best frame) for Handoff.
     */
    const getSemanticPeak = useCallback(async (): Promise<SemanticPeak | null> => {
        if (triageHistory.current.length === 0) return null;

        // Sort by confidence (default to 0 if missing)
        const sorted = [...triageHistory.current].sort((a, b) => {
            const maxA = Math.max(...a.detections.map((d) => d.confidence || 0));
            const maxB = Math.max(...b.detections.map((d) => d.confidence || 0));
            return maxB - maxA;
        });

        return sorted[0];
    }, []);

    const toggleCamera = useCallback(() => {
        setCameraActive((prev) => !prev);
    }, []);

    useEffect(() => {
        if (!cameraPermissionGranted) {
            requestCameraPermission();
        }
    }, [cameraPermissionGranted, requestCameraPermission]);

    return {
        cameraPermissionGranted,
        cameraActive,
        toggleCamera,
        cameraRef,
        cameraDevice,
        requestCameraPermission,
        frameProcessor,
        getSemanticPeak,
        zoom,
        setRegionOfInterest,
        currentDetections,
    };
}
