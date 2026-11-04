const admin = require('firebase-admin');

// Initialize with Application Default Credentials or from Env
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined;

if (!admin.apps.length) {
    admin.initializeApp({
        credential: serviceAccount ? admin.credential.cert(serviceAccount) : undefined,
        storageBucket: 'lemonade-3c4e7.firebasestorage.app',
    });
}

async function checkBucketLocation() {
    try {
        const bucket = admin.storage().bucket();
        const [metadata] = await bucket.getMetadata();
        console.log('Bucket Name:', metadata.name);
        console.log('Bucket Location:', metadata.location);
        console.log('Bucket Location Type:', metadata.locationType);
    } catch (error) {
        console.error('Error fetching bucket metadata:', error);
    }
}

checkBucketLocation();
