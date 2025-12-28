import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            credential = admin.credential.cert(serviceAccount);
        } catch (e) { console.error(e); }
    }
    if (!credential) credential = admin.credential.applicationDefault();

    admin.initializeApp({
        credential,
        projectId: 'lemonade-3c4e7',
    });
}

const auth = admin.auth();
const email = 'e2e-test@lemonade.dev';

async function checkUser() {
    try {
        const user = await auth.getUserByEmail(email);
        console.log('--- User Record ---');
        console.log('UID:', user.uid);
        console.log('Email:', user.email);
        console.log('Email Verified:', user.emailVerified);
        console.log('Disabled:', user.disabled);
        console.log('Password Hash (exists):', !!user.passwordHash);
        console.log('Providers:', user.providerData);
        
        console.log('\n✅ User exists in Authentication system.');
    } catch (error) {
        console.error('❌ Error fetching user:', error);
    }
}

checkUser();
