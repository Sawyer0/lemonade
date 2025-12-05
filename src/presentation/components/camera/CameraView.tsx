'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, RefreshCcw } from 'lucide-react';
import { useToast } from '@/presentation/context';
import { clsx } from 'clsx';

interface CameraViewProps {
    onCapture: (file: File) => Promise<void>;
    onClose: () => void;
}

export function CameraView({ onCapture, onClose }: CameraViewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const { showToast } = useToast();

    const startCamera = useCallback(async () => {
        try {
            // Stop existing tracks using ref to avoid dependency on state
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            setStream(newStream);
            streamRef.current = newStream;

            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
        } catch (error) {
            console.error('Error accessing camera:', error);
            showToast('Failed to access camera. Please check permissions.', 'error');
            onClose();
        }
    }, [facingMode, onClose, showToast]);

    useEffect(() => {

        // eslint-disable-next-line
        startCamera();
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [startCamera]);

    const handleCapture = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        setIsCapturing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) {
            setIsCapturing(false);
            return;
        }

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob/file
        canvas.toBlob(async (blob) => {
            if (blob) {
                const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
                try {
                    await onCapture(file);
                    // Stop stream after successful capture
                    streamRef.current?.getTracks().forEach(track => track.stop());
                } catch (error) {
                    console.error('Capture upload failed:', error);
                    showToast('Failed to upload image.', 'error');
                    setIsCapturing(false);
                }
            }
        }, 'image/jpeg', 0.8);
    };

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    return (
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl my-2 group">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={clsx(
                    "w-full h-full object-cover",
                    facingMode === 'user' && "scale-x-[-1]" // Mirror selfie cam
                )}
            />

            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay Controls */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">

                {/* Top Bar */}
                <div className="flex justify-end">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Bottom Bar */}
                <div className="flex items-center justify-center gap-6">
                    <button
                        onClick={toggleCamera}
                        className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all"
                        disabled={isCapturing}
                    >
                        <RefreshCcw className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleCapture}
                        disabled={isCapturing}
                        className={clsx(
                            "p-4 rounded-full border-4 border-white transition-all transform active:scale-95",
                            isCapturing ? "bg-zinc-500 scale-90" : "bg-white hover:bg-zinc-200"
                        )}
                    >
                        {isCapturing ? (
                            <div className="w-6 h-6 animate-spin rounded-full border-2 border-zinc-800 border-t-transparent" />
                        ) : (
                            <div className="w-6 h-6 rounded-full bg-transparent" />
                        )}
                    </button>

                    {/* Spacer to balance layout */}
                    <div className="w-11" />
                </div>
            </div>

            {/* Loading State */}
            {!stream && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            )}
        </div>
    );
}
