import { describe, it, expect } from 'vitest';
import { getEmulatorSettings } from '../emulators';

describe('getEmulatorSettings', () => {
    it('is off unless the flag is exactly "true"', () => {
        expect(getEmulatorSettings({})).toBeNull();
        expect(getEmulatorSettings({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'false' })).toBeNull();
        expect(getEmulatorSettings({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: '1' })).toBeNull();
    });

    it('defaults to 127.0.0.1 and the firebase.json ports', () => {
        expect(getEmulatorSettings({ NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true' })).toEqual({
            host: '127.0.0.1',
            authUrl: 'http://127.0.0.1:9099',
            firestorePort: 8080,
            storagePort: 9199,
        });
    });

    it('honours a custom host', () => {
        const settings = getEmulatorSettings({
            NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
            NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: 'emulators.local',
        });
        expect(settings?.authUrl).toBe('http://emulators.local:9099');
        expect(settings?.host).toBe('emulators.local');
    });
});
