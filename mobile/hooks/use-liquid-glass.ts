import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

/**
 * True only when real Liquid Glass can render safely on this device.
 *
 * Both native checks must pass: some iOS 26 builds expose the components
 * without the API, and rendering GlassView there crashes (expo #40911).
 * Reduce Transparency also disables the effect, so the plain token surface
 * is the honest fallback there too.
 *
 * expo-glass-effect 0.1.x has no reducedTransparencyFallbackColor prop, so
 * the fallback is chosen here instead of in the view. Until the probe
 * resolves the hook reports unavailable, so the first frame is the fallback
 * and a Reduce Transparency device never flashes glass on mount.
 */
export function useLiquidGlassAvailable(): boolean {
    // No probe API on this platform: start resolved so the native gate decides.
    const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(() =>
        typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function' ? null : false,
    );

    useEffect(() => {
        let cancelled = false;
        const checker = AccessibilityInfo.isReduceTransparencyEnabled;
        if (typeof checker === 'function') {
            checker()
                .then((enabled) => {
                    if (!cancelled) {
                        setReduceTransparency(enabled);
                    }
                })
                .catch((error) => {
                    console.warn('[LiquidGlass] Reduce Transparency probe failed; assuming glass allowed', error);
                    if (!cancelled) {
                        setReduceTransparency(false);
                    }
                });
        }
        return () => {
            cancelled = true;
        };
    }, []);

    if (reduceTransparency !== false) {
        return false;
    }
    try {
        return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
    } catch {
        return false;
    }
}
