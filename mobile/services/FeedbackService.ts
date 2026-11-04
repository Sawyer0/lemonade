import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

// The sound file (bundled in assets)
// Note: User must provide this file at mobile/assets/sounds/processing_chime.mp3
// @ts-expect-error - Asset might not be resolved by TS but is valid for Metro
const CHIME_SOURCE = require('../assets/sounds/processing_chime.mp3'); // eslint-disable-line @typescript-eslint/no-require-imports

let soundObject: Audio.Sound | null = null;

/**
 * SETUP: Call this once in your App.tsx or a high-level provider
 * This prepares the audio session and pre-loads the sound into RAM.
 */
export async function setupFeedbackService() {
    try {
        // A. Configure Audio Session to MIX with LiveKit
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            interruptionModeIOS: Audio.InterruptionModeIOS.MixWithOthers,
            interruptionModeAndroid: Audio.InterruptionModeAndroid.DuckOthers,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });

        // B. Pre-load the sound file
        const { sound } = await Audio.Sound.createAsync(CHIME_SOURCE);
        soundObject = sound;

        console.log('Feedback Service: Ready');
    } catch (error) {
        // If file is missing, we catch it here and log.
        // This allows the app to function without the physical mp3 during development.
        console.warn('Feedback Service: Could not load chime asset. Is processing_chime.mp3 in assets/sounds?', error);
    }
}

/**
 * TRIGGER: Call this when eval.risk === true
 * Plays sound and fires haptics simultaneously.
 */
export async function triggerGhostFeedback() {
    try {
        // A. Haptic Punch (Immediate physical feedback)
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // B. Audio Chime
        if (soundObject) {
            await soundObject.replayAsync();
        }
    } catch (error) {
        console.warn('Feedback trigger failed', error);
    }
}
