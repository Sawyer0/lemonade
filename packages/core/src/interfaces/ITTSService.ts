/**
 * ITTSService Interface
 * 
 * This interface defines the contract for Text-to-Speech services.
 * Implement this interface to create alternative TTS providers (e.g., ElevenLabs).
 */
export interface ITTSService {
    speak: (text: string) => void;
    stop: () => void;
    readonly isSpeaking: boolean;
}
