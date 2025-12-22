import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { SHARED_CONFIG } from '@lemonade/core';
// Manual implementation because firebase/auth/react-native export is missing in this version
// Ported from @firebase/auth/dist/rn/index.js
interface ReactNativeStorage {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
}

const getReactNativePersistence = (storage: ReactNativeStorage) => {
    // Firebase Internal Persistence requires a Class Constructor, not an instance.
    class ReactNativePersistence {
        static type = 'LOCAL';
        type = 'LOCAL'; // Instance property required by SDK

        async _isAvailable() {
            try {
                if (!storage) return false;
                await storage.setItem('__sak', '1');
                await storage.removeItem('__sak');
                return true;
            } catch { return false; }
        }


        _set(key: string, value: unknown) {
            return storage.setItem(key, JSON.stringify(value));
        }

        async _get(key: string) {
            const json = await storage.getItem(key);
            return json ? JSON.parse(json) : null;
        }

        _remove(key: string) {
            return storage.removeItem(key);
        }

        _addListener() { }
        _removeListener() { }
    }

    return ReactNativePersistence;
};
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
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

// Initialize Auth with persistence
// We try to initialize with AsyncStorage first. 
// If it throws (because an instance already exists, e.g. hot reload), we fall back to getAuth.
let auth: Auth;
try {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
} catch (e: unknown) {
    console.error("Firebase Auth initialization failed, possibly due to hot reload:", e);
    // Auth already initialized (likely during hot reload)
    auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
