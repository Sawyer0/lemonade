import { useCallback, useRef, useState } from 'react';

/**
 * ITTSService Interface - Enables easy replacement of TTS provider
 */
export interface ITTSService {
    speak: (text: string) => void;
    stop: () => void;
    isSpeaking: boolean;
}

/**
 * useTTS Hook - Web Speech API Implementation
 * 
 * Architecture: This hook implements ITTSService interface, making it easy
 * to swap out the underlying provider (e.g., ElevenLabs) without changing
 * the component API.
 */
export function useTTS(): ITTSService {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

    const speak = useCallback((text: string) => {
        // Cancel any ongoing speech
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        // Configure voice properties for a professional tone
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Try to find a good voice (prefer US English)
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
            (v) => v.lang.startsWith('en-US') && v.name.includes('Google')
        ) || voices.find((v) => v.lang.startsWith('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        // Event handlers
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    }, []);

    const stop = useCallback(() => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, []);

    return { speak, stop, isSpeaking };
}

