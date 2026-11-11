/**
 * Settings for pointing the web client at the Firebase Local Emulator Suite.
 * Next.js inlines NEXT_PUBLIC_* at build time, so the flag must be set when
 * running `next dev` or `next build`, never in a production deploy.
 */
export interface FirebaseEmulatorSettings {
    host: string;
    authUrl: string;
    firestorePort: number;
    storagePort: number;
}

export interface FirebaseEmulatorEnv {
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS?: string;
    NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?: string;
}

/** Ports match the `emulators` block in firebase.json. */
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 } as const;

export function getEmulatorSettings(env: FirebaseEmulatorEnv): FirebaseEmulatorSettings | null {
    if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== 'true') return null;
    const host = env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
    return {
        host,
        authUrl: `http://${host}:${EMULATOR_PORTS.auth}`,
        firestorePort: EMULATOR_PORTS.firestore,
        storagePort: EMULATOR_PORTS.storage,
    };
}
