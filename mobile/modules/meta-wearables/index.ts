import MetaWearablesModule, { MetaWearablesEvents } from './src/MetaWearablesModule';
import MetaStreamView from './src/MetaStreamView';

const isNativeAvailable = MetaWearablesModule !== null;

// Stub functions that warn when native module isn't available
function warnNotAvailable(methodName: string): void {
    console.warn(`[MetaWearables] ${methodName} called but native module is not available`);
}

export function initialize(): void {
    if (!MetaWearablesModule) return warnNotAvailable('initialize');
    return MetaWearablesModule.initialize();
}

export function startRegistration(): void {
    if (!MetaWearablesModule) return warnNotAvailable('startRegistration');
    return MetaWearablesModule.startRegistration();
}

export function getRegistrationState(): string {
    if (!MetaWearablesModule) {
        warnNotAvailable('getRegistrationState');
        return 'unavailable';
    }
    return MetaWearablesModule.getRegistrationState();
}

export function checkPermission(permissionName: string): boolean {
    if (!MetaWearablesModule) {
        warnNotAvailable('checkPermission');
        return false;
    }
    return MetaWearablesModule.checkPermission(permissionName);
}

export async function requestPermission(permissionName: string): Promise<void> {
    if (!MetaWearablesModule) {
        warnNotAvailable('requestPermission');
        return;
    }
    return await MetaWearablesModule.requestPermission(permissionName);
}

export async function startStream(deviceId?: string): Promise<void> {
    if (!MetaWearablesModule) {
        warnNotAvailable('startStream');
        return;
    }
    return await MetaWearablesModule.startStream(deviceId);
}

export async function capturePhoto(): Promise<string> {
    if (!MetaWearablesModule) {
        warnNotAvailable('capturePhoto');
        return '';
    }
    return await MetaWearablesModule.capturePhoto();
}

export function stopStream(): void {
    if (!MetaWearablesModule) return warnNotAvailable('stopStream');
    return MetaWearablesModule.stopStream();
}

export async function simulateConnection(): Promise<string> {
    if (!MetaWearablesModule) {
        warnNotAvailable('simulateConnection');
        return 'unavailable';
    }
    return await MetaWearablesModule.simulateConnection();
}

interface Subscription {
    remove: () => void;
}

const noopSubscription: Subscription = { remove: () => {} };

function addListener<E extends keyof MetaWearablesEvents>(event: E, listener: MetaWearablesEvents[E]): Subscription {
    return MetaWearablesModule ? MetaWearablesModule.addListener(event, listener) : noopSubscription;
}

export function addRegistrationChangeListener(listener: MetaWearablesEvents['onRegistrationChange']): Subscription {
    return addListener('onRegistrationChange', listener);
}

export function addStreamStateChangeListener(listener: MetaWearablesEvents['onStreamStateChange']): Subscription {
    return addListener('onStreamStateChange', listener);
}

export function addPermissionResultListener(listener: MetaWearablesEvents['onPermissionResult']): Subscription {
    return addListener('onPermissionResult', listener);
}

export { MetaStreamView, isNativeAvailable };
