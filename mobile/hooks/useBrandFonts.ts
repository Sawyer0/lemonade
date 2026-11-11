import { useFonts } from 'expo-font';
import {
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
} from '@expo-google-fonts/rubik';
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
 */
export function useBrandFonts(): boolean {
    const [loaded] = useFonts({
        Rubik_400Regular,
        Rubik_500Medium,
        Rubik_600SemiBold,
        Rubik_700Bold,
        JetBrainsMono_400Regular,
        JetBrainsMono_500Medium,
        JetBrainsMono_700Bold,
    });
    return loaded;
}
