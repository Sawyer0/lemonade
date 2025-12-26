// @ts-expect-error - expo-modules-core types resolved at runtime
import { EventEmitter, NativeModulesProxy } from 'expo-modules-core';
import MetaWearablesModule from './src/MetaWearablesModule';
import MetaStreamView from './src/MetaStreamView';

// Check if native module is available
const isNativeAvailable = MetaWearablesModule != null;

// Create event emitter only if native module is available
const emitter = isNativeAvailable
  ? new EventEmitter(MetaWearablesModule ?? NativeModulesProxy.MetaWearables)
  : null;

// Stub functions that warn when native module isn't available
function warnNotAvailable(methodName: string): void {
  console.warn(`[MetaWearables] ${methodName} called but native module is not available`);
}

export function initialize(): void {
  if (!isNativeAvailable) return warnNotAvailable('initialize');
  return MetaWearablesModule.initialize();
}

export function startRegistration(): void {
  if (!isNativeAvailable) return warnNotAvailable('startRegistration');
  return MetaWearablesModule.startRegistration();
}

export function getRegistrationState(): string {
  if (!isNativeAvailable) { warnNotAvailable('getRegistrationState'); return 'unavailable'; }
  return MetaWearablesModule.getRegistrationState();
}

export function checkPermission(permissionName: string): boolean {
  if (!isNativeAvailable) { warnNotAvailable('checkPermission'); return false; }
  return MetaWearablesModule.checkPermission(permissionName);
}

export async function requestPermission(permissionName: string): Promise<void> {
  if (!isNativeAvailable) { warnNotAvailable('requestPermission'); return; }
  return await MetaWearablesModule.requestPermission(permissionName);
}

export async function startStream(deviceId?: string): Promise<void> {
  if (!isNativeAvailable) { warnNotAvailable('startStream'); return; }
  return await MetaWearablesModule.startStream(deviceId);
}

export async function capturePhoto(): Promise<string> {
  if (!isNativeAvailable) { warnNotAvailable('capturePhoto'); return ''; }
  return await MetaWearablesModule.capturePhoto();
}

export function stopStream(): void {
  if (!isNativeAvailable) return warnNotAvailable('stopStream');
  return MetaWearablesModule.stopStream();
}

export async function simulateConnection(): Promise<string> {
  if (!isNativeAvailable) { warnNotAvailable('simulateConnection'); return 'unavailable'; }
  return await MetaWearablesModule.simulateConnection();
}

interface Subscription {
  remove: () => void;
}

const noopSubscription: Subscription = { remove: () => { } };

export function addRegistrationChangeListener(listener: (event: { state: string }) => void): Subscription {
  if (!emitter) return noopSubscription;
  return emitter.addListener('onRegistrationChange', listener);
}

export function addStreamStateChangeListener(listener: (event: { state: string }) => void): Subscription {
  if (!emitter) return noopSubscription;
  return emitter.addListener('onStreamStateChange', listener);
}

export function addPermissionResultListener(listener: (event: { permission: string, status: string }) => void): Subscription {
  if (!emitter) return noopSubscription;
  return emitter.addListener('onPermissionResult', listener);
}

export { MetaStreamView, isNativeAvailable };