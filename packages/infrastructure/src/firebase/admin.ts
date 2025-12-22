import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { CONFIG } from '../config';

if (getApps().length === 0) {
    if (CONFIG.FIREBASE.SERVICE_ACCOUNT_KEY) {
        initializeApp({
            credential: cert(JSON.parse(CONFIG.FIREBASE.SERVICE_ACCOUNT_KEY)),
            storageBucket: CONFIG.GCLOUD.MEDIA_BUCKET
        });
    } else {
        initializeApp({
            storageBucket: CONFIG.GCLOUD.MEDIA_BUCKET
        });
    }
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
export const adminStorage = getStorage();
