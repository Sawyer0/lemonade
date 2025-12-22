import { EventEmitter, Subscription, NativeModulesProxy } from 'expo-modules-core';
import MetaWearablesModule from './MetaWearablesModule';
import MetaStreamView from './MetaStreamView';

export function initialize(): void {
  return MetaWearablesModule.initialize();
}

export function startRegistration(): void {
  return MetaWearablesModule.startRegistration();
}

export function getRegistrationState(): string {
  return MetaWearablesModule.getRegistrationState();
}

export function checkPermission(permissionName: string): boolean {
  return MetaWearablesModule.checkPermission(permissionName);
}

export async function requestPermission(permissionName: string): Promise<void> {
  return await MetaWearablesModule.requestPermission(permissionName);
}

export async function startStream(deviceId: string): Promise<void> {
  return await MetaWearablesModule.startStream(deviceId);
}

export async function capturePhoto(): Promise<string> {
  return await MetaWearablesModule.capturePhoto();
}

export function stopStream(): void {
  return MetaWearablesModule.stopStream();
}

const emitter = new EventEmitter(MetaWearablesModule ?? NativeModulesProxy.MetaWearables);

export function addRegistrationChangeListener(listener: (event: { state: string }) => void): Subscription {
  return emitter.addListener('onRegistrationChange', listener);
}

export function addStreamStateChangeListener(listener: (event: { state: string }) => void): Subscription {
  return emitter.addListener('onStreamStateChange', listener);
}

export { MetaStreamView };
