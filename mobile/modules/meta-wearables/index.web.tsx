import React from 'react';

// Mock implementation for Web
const MockModule = {
    initialize: () => {
        console.log('MetaWearables.initialize called (mock)');
    },
    startRegistration: () => {
        console.log('MetaWearables.startRegistration called (mock)');
    },
    getRegistrationState: () => 'MOCK_MODE',
    requestPermission: async () => {},
    startStream: async () => {},
    capturePhoto: async () => 'mock-photo-uri',
    stopStream: () => {},
};

export function initialize(): void {
    return MockModule.initialize();
}

export function startRegistration(): void {
    return MockModule.startRegistration();
}

export function getRegistrationState(): string {
    return MockModule.getRegistrationState();
}

export async function checkPermission(): Promise<boolean> {
    return false;
}

export async function requestPermission(): Promise<void> {}

export async function startStream(): Promise<void> {}

export async function capturePhoto(): Promise<string> {
    return 'mock-photo-uri';
}

export function stopStream(): void {}

interface Subscription {
    remove: () => void;
}

export function addRegistrationChangeListener(): Subscription {
    return { remove: () => {} };
}

export function addStreamStateChangeListener(): Subscription {
    return { remove: () => {} };
}

export function addPermissionResultListener(): Subscription {
    return { remove: () => {} };
}

export const MetaStreamView: React.FC<object> = () => <></>;
export const isNativeAvailable = false;
