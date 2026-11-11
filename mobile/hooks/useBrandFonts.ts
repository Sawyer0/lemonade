import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold } from '@expo-google-fonts/rubik';
import {
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

/**
 * Loads the brand fonts: Rubik for prose and UI, JetBrains Mono for data
 * (DTC codes, VINs, readings). Returns true once every face is loaded; the
 * root layout gates first paint on it so text never flashes in the
 * fallback font.
 *
 * A load error never blocks first paint: the error is logged and the hook
 * reports ready, so the app renders with system fallback fonts instead of
 * hanging on the loading spinner forever.
 */
export function useBrandFonts(): boolean {
    const [loaded, error] = useFonts({
        Rubik_400Regular,
        Rubik_500Medium,
        Rubik_600SemiBold,
        Rubik_700Bold,
        JetBrainsMono_400Regular,
        JetBrainsMono_500Medium,
        JetBrainsMono_700Bold,
    });

    useEffect(() => {
        if (error) {
            console.error('Failed to load brand fonts, using system fallbacks', error);
        }
    }, [error]);

    return loaded || error != null;
}
