import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Haptics from 'expo-haptics';
import processingChime from '../assets/sounds/processing_chime.mp3';

let chime: Audio.Sound | null = null;
let setupPromise: Promise<void> | null = null;

/**
 * Configures the audio session to mix with LiveKit and preloads the chime.
 * Safe to call more than once; later calls reuse the first setup.
 */
export function setupFeedbackService(): Promise<void> {
    setupPromise ??= (async () => {
        try {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
                interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });
            const { sound } = await Audio.Sound.createAsync(processingChime);
            chime = sound;
        } catch (error) {
            // Haptics still fire without audio, so a failed preload is not fatal.
            console.warn('Feedback Service: could not prepare the processing chime', error);
        }
    })();
    return setupPromise;
}

/**
 * Plays the "looking into it" cue: a haptic tap plus a short two-note chime.
 * Fired when on-device triage escalates a detection to the Master Tech.
 */
export async function triggerGhostFeedback(): Promise<void> {
    try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await chime?.replayAsync();
    } catch (error) {
        console.warn('Feedback trigger failed', error);
    }
}
