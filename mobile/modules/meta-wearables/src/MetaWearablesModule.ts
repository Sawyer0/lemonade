// @ts-expect-error - expo-modules-core types resolved at runtime
import { requireNativeModule } from 'expo-modules-core';

// Try to load the native module, returns null if not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MetaWearablesModule: any = null;

try {
    MetaWearablesModule = requireNativeModule('MetaWearables');
} catch {
    // Native module not available - this is expected on some platforms
    console.log('[MetaWearables] Native module not available');
}

export default MetaWearablesModule;
