import "server-only";
import { initializeApp, getApps, getApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

// In production (Cloud Run), we might use ADC (Application Default Credentials) instead,
// but for local dev/Vercel, the JSON string is standard.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : {};

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_KEY is missing in admin.ts');
}

const firebaseAdminConfig = {
    credential: cert(serviceAccount),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

const app = !getApps().length ? initializeApp(firebaseAdminConfig) : getApp();

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const adminStorage = getStorage(app);
