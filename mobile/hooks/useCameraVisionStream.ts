// mobile/hooks/useCameraVisionStream.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, useCameraDevices, useCameraPermission, CameraDevice } from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import { LocalParticipant } from 'livekit-client';
import { MobileLogger } from '@mobile/services/MobileLogger';

interface UseCameraVisionStreamOptions {
    localParticipant: LocalParticipant | null;
    visionTopic: string; // Kept for interface compatibility, though used differently now
    captureInterval?: number; // 500ms default for buffer loop
    sessionId: string;
}

export function useCameraVisionStream({
    localParticipant,
    visionTopic,
    captureInterval = 500, // 500ms for "Time Machine" buffer
    sessionId
}: UseCameraVisionStreamOptions) {
    const logger = useRef(new MobileLogger()).current;

    // Camera Permissions & Device
    const devices = useCameraDevices();
    const cameraDevice = devices.back; // Prefer back camera
    const { hasPermission: cameraPermissionGranted, requestPermission: requestCameraPermission } = useCameraPermission();

    // Camera State
    const [cameraActive, setCameraActive] = useState(false);
    const cameraRef = useRef<Camera>(null);
    const bufferLoopRef = useRef<NodeJS.Timeout | null>(null);
    
    // Ring Buffer: Stores file paths of the last 3 frames
    const frameBuffer = useRef<string[]>([]);
    const MAX_BUFFER_SIZE = 3;

    // Start the "Silent Observer" loop
    const startBufferLoop = useCallback(async () => {
        if (!cameraPermissionGranted || !cameraDevice) {
            logger.warn("Cannot start buffer loop: Permissions or device missing.");
            return;
        }
        if (bufferLoopRef.current) return; // Already running

        logger.info("Starting visual buffer loop (Silent Observer)...");
        
        bufferLoopRef.current = setInterval(async () => {
            if (!cameraRef.current || !cameraActive) return;

            try {
                const photo = await cameraRef.current.takePhoto({
                    qualityPrioritization: 'speed',
                    quality: 40, // Lower quality for buffer is acceptable, or keep high if bandwidth allows burst
                    skipMetadata: true,
                });

                const path = `file://${photo.path}`;
                
                // Add to buffer
                frameBuffer.current.push(path);

                // Maintain Ring Buffer Size
                if (frameBuffer.current.length > MAX_BUFFER_SIZE) {
                    const oldestFrame = frameBuffer.current.shift();
                    if (oldestFrame) {
                        // Clean up file to prevent storage bloat
                        RNFS.unlink(oldestFrame).catch(err => 
                            logger.warn(`Failed to cleanup frame: ${oldestFrame}`, err)
                        );
                    }
                }

            } catch (error) {
                logger.error("Failed to capture buffer frame:", error as Error);
            }
        }, captureInterval);
    }, [cameraPermissionGranted, cameraDevice, cameraActive, captureInterval, logger]);

    const stopBufferLoop = useCallback(() => {
        if (bufferLoopRef.current) {
            clearInterval(bufferLoopRef.current);
            bufferLoopRef.current = null;
            
            // Clean up all buffered frames
            frameBuffer.current.forEach(path => {
                RNFS.unlink(path).catch(() => {});
            });
            frameBuffer.current = [];
            
            logger.info("Stopped visual buffer loop.");
        }
    }, [logger]);

    // Called when Agent requests a "Semantic Burst"
    const flushBuffer = useCallback(async (): Promise<string[]> => {
        logger.info("Flushing visual buffer for Semantic Burst...");
        const encodedFrames: string[] = [];

        // Read all current frames in buffer
        for (const path of frameBuffer.current) {
            try {
                const base64 = await RNFS.readFile(path, 'base64');
                encodedFrames.push(base64);
            } catch (error) {
                logger.error(`Failed to read frame for burst: ${path}`, error as Error);
            }
        }

        // Note: We do NOT clear the buffer here, as the user might still be talking
        // and we want to maintain context. We only clear on stop.
        
        return encodedFrames;
    }, [logger]);

    const toggleCamera = useCallback(() => {
        setCameraActive(prev => !prev);
    }, []);

    // Manage Loop Lifecycle
    useEffect(() => {
        if (cameraActive) {
            startBufferLoop();
        } else {
            stopBufferLoop();
        }
        return () => stopBufferLoop();
    }, [cameraActive, startBufferLoop, stopBufferLoop]);

    // Request permissions on mount
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
        flushBuffer, // New API
    };
}