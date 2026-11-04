import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, Auth } from 'firebase/auth';
import { SHARED_CONFIG } from '@lemonade/core';
// The react-native build of @firebase/auth ships AsyncStorage-backed persistence;
// TypeScript resolves its types through the react-native export condition.
import { getReactNativePersistence } from '@firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { connectAuthEmulator } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo uses EXPO_PUBLIC_ prefix for environment variables
const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: SHARED_CONFIG.GCLOUD.PROJECT_ID,
    storageBucket: SHARED_CONFIG.GCLOUD.MEDIA_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Singleton pattern
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with persistence (handles hot reload gracefully)
let auth: Auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });
} catch {
    // Expected during hot reload - auth already initialized, just get existing instance
    auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

// --- Emulator Connection Logic ---
if (__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATORS === 'true') {
    const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || '10.0.2.2'; // Android Emulator localhost
    console.log(`[Firebase] Connecting to Emulators at ${EMULATOR_HOST}...`);

    try {
        connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`);
        connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
        connectStorageEmulator(storage, EMULATOR_HOST, 9199);
        console.log('[Firebase] Emulators connected successfully.');
    } catch (e) {
        console.warn('[Firebase] Emulator connection failed (already connected?):', e);
    }
}

export { auth, db, storage };
