import { useState } from 'react';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

interface UseVoiceCommandResult {
    processAudio: (audioData: Float32Array, sessionId: string) => Promise<string | null>;
    isProcessing: boolean;
    error: string | null;
}

export function useVoiceCommand(): UseVoiceCommandResult {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processAudio = async (audioData: Float32Array, sessionId: string): Promise<string | null> => {
        setIsProcessing(true);
        setError(null);

        try {
            const audioArray = Array.from(audioData);

            const response = await fetch('/api/voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioData: audioArray,
                    sessionId
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new AppError(ErrorCode.AI_SERVICE_ERROR, data.error || 'Voice processing failed');
            }

            return data.response;

        } catch (err) {
            // Standardized error handling: Capture message but do not log to console in production
            // In a real app, this would go to a logging service (e.g., Sentry)
            const message = AppError.fromError(err).message;
            setError(message);
            return null;
        } finally {
            setIsProcessing(false);
        }
    };

    return { processAudio, isProcessing, error };
}
