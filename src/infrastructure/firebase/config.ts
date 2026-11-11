import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { SHARED_CONFIG } from '@lemonade/core';
import { getEmulatorSettings } from './emulators';

// Literal process.env reads so Next.js can inline them into the client bundle.
const emulators = getEmulatorSettings({
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST,
});

const firebaseConfig = {
    // The emulators accept any API key, so local runs work without real credentials.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (emulators ? 'demo-key' : undefined),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || SHARED_CONFIG.GCLOUD.PROJECT_ID,
    storageBucket: SHARED_CONFIG.GCLOUD.MEDIA_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isFirstInit = !getApps().length;
const app: FirebaseApp | null = firebaseConfig.apiKey ? (isFirstInit ? initializeApp(firebaseConfig) : getApp()) : null;

export const auth = (app ? getAuth(app) : null) as Auth;
export const db = (app ? getFirestore(app) : null) as Firestore;
export const storage = (app ? getStorage(app) : null) as FirebaseStorage;

// Connect once per page load; hot reloads re-run this module against the same app.
if (app && emulators && isFirstInit) {
    connectAuthEmulator(auth, emulators.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, emulators.host, emulators.firestorePort);
    connectStorageEmulator(storage, emulators.host, emulators.storagePort);
}
