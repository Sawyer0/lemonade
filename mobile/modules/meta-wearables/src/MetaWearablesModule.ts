import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type MetaWearablesEvents = {
    onRegistrationChange: (event: { state: string }) => void;
    onStreamStateChange: (event: { state: string }) => void;
    onPermissionResult: (event: { permission: string; status: string }) => void;
};

/**
 * Shape of the native MetaWearables Expo module (android/, over the Meta
 * Wearables Device Access Toolkit). There is no iOS implementation yet.
 */
declare class MetaWearablesNativeModule extends NativeModule<MetaWearablesEvents> {
    initialize(): void;
    startRegistration(): void;
    getRegistrationState(): string;
    checkPermission(permissionName: string): Promise<boolean>;
    requestPermission(permissionName: string): Promise<void>;
    startStream(deviceId?: string): Promise<void>;
    capturePhoto(): Promise<string>;
    stopStream(): void;
}

/** Null on platforms or builds without the native module (iOS, Expo Go, tests). */
const MetaWearablesModule = requireOptionalNativeModule<MetaWearablesNativeModule>('MetaWearables');

export default MetaWearablesModule;
